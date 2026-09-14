// Lógica de envío compartida entre newsletter-send.js (manual, desde el dashboard)
// y newsletter-cron.js (automático). Extraída para no duplicar código (columna 8 del plan).
const { getPool } = require('./_db');
const { getHistoriaById } = require('./_notion-historias');
const { renderEmail } = require('./_email-template');
const { sendEmail } = require('./_resend');

/**
 * Envía (o reanuda un envío parcial de) una historia de Notion a todos los suscriptores activos.
 * Idempotente por destinatario: si se llama de nuevo sobre el mismo `sendId`, no reenvía a quien
 * ya tiene una fila en send_recipients para ese send_id.
 *
 * @param {Object} opts
 * @param {string} opts.notionPageId
 * @param {string} [opts.sendId] - si se pasa, reanuda ese envío (fila ya existente en `sends`); si no, crea uno nuevo.
 * @param {string} [opts.siteUrl]
 */
async function sendNewsletterForPage({ notionPageId, sendId, siteUrl }) {
  const db = getPool();
  const site = siteUrl || process.env.SITE_URL || 'https://vidigoztv.com';

  const historia = await getHistoriaById(notionPageId);
  const subject = historia.titulo || 'Nueva historia de VidigozTV';

  // ── Fila en `sends`: crear si no existe, o reusar la que ya traía scheduled_at ──
  let send;
  if (sendId) {
    const r = await db.query('SELECT * FROM sends WHERE id = $1', [sendId]);
    if (r.rowCount === 0) throw new Error('sendId no encontrado');
    send = r.rows[0];
    if (send.sent) return { alreadySent: true, sendId: send.id, recipientsCount: send.recipients_count };
    await db.query('UPDATE sends SET subject = $2 WHERE id = $1', [send.id, subject]);
  } else {
    // Evita doble envío si ya existe un send completado para esta misma página.
    const existing = await db.query('SELECT id, sent FROM sends WHERE notion_page_id = $1 AND sent = true LIMIT 1', [notionPageId]);
    if (existing.rowCount > 0) {
      return { alreadySent: true, sendId: existing.rows[0].id };
    }
    const ins = await db.query(
      `INSERT INTO sends (notion_page_id, subject) VALUES ($1, $2) RETURNING *`,
      [notionPageId, subject]
    );
    send = ins.rows[0];
  }

  // ── Suscriptores activos que aún no recibieron este envío ──
  const subs = await db.query(
    `SELECT s.id, s.email, s.nombre, s.unsubscribe_token
     FROM subscribers s
     WHERE s.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)`,
    [send.id]
  );

  let sentCount = 0;
  let errorCount = 0;

  for (const sub of subs.rows) {
    const unsubscribeLink = `${site}/.netlify/functions/newsletter-unsubscribe?token=${sub.unsubscribe_token}`;
    const html = renderEmail({
      titulo: historia.titulo,
      cuerpo: historia.historia,
      imagenUrl: historia.imagenUrl,
      unsubscribeLink,
      siteUrl: site,
    });

    const result = await sendEmail({ to: sub.email, subject, html });

    if (result.ok) {
      await db.query(
        `INSERT INTO send_recipients (send_id, subscriber_id, resend_email_id, delivered_at)
         VALUES ($1, $2, $3, now())`,
        [send.id, sub.id, result.id || null]
      );
      sentCount++;
    } else {
      errorCount++;
      console.error(`[newsletter-send] error enviando a ${sub.email}:`, result.error);
      // No se inserta en send_recipients → un reintento posterior lo volverá a tomar.
    }
  }

  const totalRecipients = await db.query('SELECT count(*)::int AS count FROM send_recipients WHERE send_id = $1', [send.id]);
  const finalCount = totalRecipients.rows[0].count;

  // Solo se marca `sent = true` si no hubo errores pendientes (todo-o-nada por destinatario,
  // pero el envío global se considera completo únicamente cuando ya no quedan activos sin cubrir).
  const remaining = await db.query(
    `SELECT count(*)::int AS count FROM subscribers s
     WHERE s.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)`,
    [send.id]
  );

  const fullyDone = remaining.rows[0].count === 0;
  if (fullyDone) {
    await db.query(
      `UPDATE sends SET sent = true, sent_at = now(), recipients_count = $2 WHERE id = $1`,
      [send.id, finalCount]
    );
  } else {
    await db.query(`UPDATE sends SET recipients_count = $2 WHERE id = $1`, [send.id, finalCount]);
  }

  return {
    alreadySent: false,
    sendId: send.id,
    sentCount,
    errorCount,
    recipientsCount: finalCount,
    fullyDone,
  };
}

module.exports = { sendNewsletterForPage };
