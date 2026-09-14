// Netlify Scheduled Function — corre automáticamente según el horario declarado en
// netlify.toml ([functions."newsletter-cron"] schedule = "0 9 * * *", 9am UTC ≈ 3am Tecate).
// El resto de las functions de este repo usan CommonJS (`exports.handler`), así que el
// schedule se declara en netlify.toml en vez de con `export const config` (sintaxis ESM de
// Netlify Functions v2) para mantener consistencia con el resto del código.
//
// Lógica:
//  1. Busca en `sends` lo que tenga scheduled_at <= now() AND sent = false → lo envía.
//  2. Si no hay nada programado, revisa Notion por Estado = Programado sin envío previo
//     completado en `sends` (mismo criterio que newsletter-send.js) y envía la más antigua
//     sin tocar — evita enviar automáticamente TODO lo que esté "Programado" de golpe;
//     solo una historia por corrida, para no inundar bandejas si se acumulan varias.
const { getPool } = require('./_db');
const { listHistorias } = require('./_notion-historias');
const { sendNewsletterForPage } = require('./_send-logic');

exports.handler = async () => {
  const db = getPool();
  const siteUrl = process.env.SITE_URL || 'https://vidigoztv.com';
  const log = [];

  try {
    // 1) Envíos programados vencidos
    const due = await db.query(
      `SELECT id, notion_page_id FROM sends WHERE scheduled_at IS NOT NULL AND scheduled_at <= now() AND sent = false ORDER BY scheduled_at ASC LIMIT 1`
    );

    if (due.rowCount > 0) {
      const row = due.rows[0];
      log.push(`Enviando send programado ${row.id} (notion ${row.notion_page_id})`);
      const result = await sendNewsletterForPage({ notionPageId: row.notion_page_id, sendId: row.id, siteUrl });
      log.push(JSON.stringify(result));
      console.log('[newsletter-cron]', log.join(' | '));
      return { statusCode: 200, body: JSON.stringify({ ran: true, mode: 'scheduled', result }) };
    }

    // 2) Nada programado → buscar la historia "Programado" más antigua sin envío previo
    const historias = await listHistorias({ allStatuses: false });
    // Ordenar por fecha de publicación ascendente para tomar la más antigua pendiente primero.
    const sorted = [...historias].sort((a, b) => {
      const da = a.fechaPublicacion ? new Date(a.fechaPublicacion).getTime() : 0;
      const db_ = b.fechaPublicacion ? new Date(b.fechaPublicacion).getTime() : 0;
      return da - db_;
    });

    for (const h of sorted) {
      const existing = await db.query('SELECT id FROM sends WHERE notion_page_id = $1 AND sent = true LIMIT 1', [h.id]);
      if (existing.rowCount === 0) {
        log.push(`Enviando historia sin envío previo: ${h.id} (${h.titulo})`);
        const result = await sendNewsletterForPage({ notionPageId: h.id, siteUrl });
        log.push(JSON.stringify(result));
        console.log('[newsletter-cron]', log.join(' | '));
        return { statusCode: 200, body: JSON.stringify({ ran: true, mode: 'auto', result }) };
      }
    }

    console.log('[newsletter-cron] Nada que enviar en esta corrida.');
    return { statusCode: 200, body: JSON.stringify({ ran: false, reason: 'Nada pendiente' }) };
  } catch (err) {
    console.error('[newsletter-cron] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
