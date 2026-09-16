// Lógica de envío compartida entre newsletter-send.js (manual, desde el dashboard)
// y newsletter-cron.js (automático). Extraída para no duplicar código (columna 8 del plan).
const { getPool } = require('./db');
const { getHistoriaById } = require('./notion-historias');
const { renderEmail } = require('./email-template');
const { sendEmail } = require('./resend');

/**
 * Envía (o reanuda un envío parcial de) una historia de Notion a los suscriptores activos.
 * Idempotente por destinatario dentro del MISMO send_id: si se llama de nuevo sobre el mismo
 * `sendId`, no reenvía a quien ya tiene una fila en send_recipients para ese send_id — así un
 * reintento tras un error parcial nunca duplica a quien ya recibió ese envío en particular.
 *
 * Reenvíos: si la historia ya se envió antes (hay un `sends.sent = true` previo para el mismo
 * notion_page_id) y se llama de nuevo SIN `sendId`, se crea un registro `sends` nuevo e
 * independiente — cada reenvío queda trazado por separado en el Historial, con su propio
 * conteo y open/click rate. `resendMode` decide a quién le llega ese reenvío:
 *   - 'onlyNew' (default): solo a quienes nunca recibieron esta historia en ningún envío
 *     anterior — nadie recibe la misma historia dos veces.
 *   - 'all': a todos los suscriptores activos de nuevo, sin excluir a quien ya la recibió.
 *
 * @param {Object} opts
 * @param {string} opts.notionPageId
 * @param {string} [opts.sendId] - si se pasa, reanuda ese envío (fila ya existente en `sends`); si no, crea uno nuevo.
 * @param {string} [opts.siteUrl]
 * @param {'onlyNew'|'all'} [opts.resendMode] - solo aplica al crear un send nuevo para una historia ya enviada antes.
 */
async function sendNewsletterForPage({ notionPageId, sendId, siteUrl, resendMode }) {
  const db = getPool();
  const site = siteUrl || process.env.SITE_URL || 'https://vidigoztv.com';

  const historia = await getHistoriaById(notionPageId);
  const subject = historia.titulo || 'Nueva historia de VidigozTV';

  // ── Fila en `sends`: reanudar una existente, o crear una nueva (primer envío o reenvío) ──
  let send;
  let isResend = false;
  let mode = resendMode === 'all' ? 'all' : 'onlyNew';
  if (sendId) {
    const r = await db.query('SELECT * FROM sends WHERE id = $1', [sendId]);
    if (r.rowCount === 0) throw new Error('sendId no encontrado');
    send = r.rows[0];
    if (send.sent) return { alreadySent: true, sendId: send.id, recipientsCount: send.recipients_count };
    // ¿Esta fila reanudada es un reenvío? Lo es si ya existe OTRO send completado para la
    // misma historia (excluyendo esta misma fila, que todavía no está sent=true). El modo
    // guardado en la propia fila (elegido al programar) manda sobre el parámetro recibido.
    const other = await db.query('SELECT id FROM sends WHERE notion_page_id = $1 AND sent = true AND id <> $2 LIMIT 1', [notionPageId, send.id]);
    isResend = other.rowCount > 0;
    if (send.resend_mode) mode = send.resend_mode;
    await db.query('UPDATE sends SET subject = $2 WHERE id = $1', [send.id, subject]);
  } else {
    const existing = await db.query('SELECT id, sent FROM sends WHERE notion_page_id = $1 AND sent = true ORDER BY sent_at DESC LIMIT 1', [notionPageId]);
    isResend = existing.rowCount > 0;
    const ins = await db.query(
      `INSERT INTO sends (notion_page_id, subject, resend_mode) VALUES ($1, $2, $3) RETURNING *`,
      [notionPageId, subject, isResend ? mode : null]
    );
    send = ins.rows[0];
  }

  // ── Suscriptores a los que les toca este envío ──
  // Dentro del MISMO send_id nunca se repite (reintento tras error parcial).
  // En un reenvío con mode='onlyNew' también se excluye a quien ya recibió esta historia
  // en cualquier send_id anterior ya completado.
  const excludeAcrossSends = isResend && mode === 'onlyNew';
  const subs = await db.query(
    excludeAcrossSends
      ? `SELECT s.id, s.email, s.nombre, s.unsubscribe_token
         FROM subscribers s
         WHERE s.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)
           AND NOT EXISTS (
             SELECT 1 FROM send_recipients sr2
             JOIN sends s2 ON s2.id = sr2.send_id
             WHERE s2.notion_page_id = $2 AND s2.sent = true AND sr2.subscriber_id = s.id
           )`
      : `SELECT s.id, s.email, s.nombre, s.unsubscribe_token
         FROM subscribers s
         WHERE s.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)`,
    excludeAcrossSends ? [send.id, notionPageId] : [send.id]
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
  // pero el envío global se considera completo únicamente cuando ya no quedan activos sin cubrir
  // — usando el mismo criterio de "a quién le toca" que se usó para elegir destinatarios arriba,
  // si no, un reenvío con mode='onlyNew' nunca llegaría a fullyDone=true).
  const remaining = await db.query(
    excludeAcrossSends
      ? `SELECT count(*)::int AS count FROM subscribers s
         WHERE s.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)
           AND NOT EXISTS (
             SELECT 1 FROM send_recipients sr2
             JOIN sends s2 ON s2.id = sr2.send_id
             WHERE s2.notion_page_id = $2 AND s2.sent = true AND sr2.subscriber_id = s.id
           )`
      : `SELECT count(*)::int AS count FROM subscribers s
         WHERE s.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)`,
    excludeAcrossSends ? [send.id, notionPageId] : [send.id]
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
