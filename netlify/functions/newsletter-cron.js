// Netlify Scheduled Function — corre automáticamente según el horario declarado en
// netlify.toml ([functions."newsletter-cron"] schedule = "*/30 * * * *", cada 30 minutos).
// Antes corría una vez al día (9am UTC): un envío programado para una hora específica del
// mismo día nunca llegaba a dispararse porque el siguiente chequeo era hasta el día
// siguiente. Con 30 min el margen de retraso máximo entre la hora programada y el envío
// real es de 30 minutos, sin importar qué hora se haya elegido.
// El resto de las functions de este repo usan CommonJS (`exports.handler`), así que el
// schedule se declara en netlify.toml en vez de con `export const config` (sintaxis ESM de
// Netlify Functions v2) para mantener consistencia con el resto del código.
//
// Lógica: SOLO respeta lo que el usuario programó explícitamente desde el dashboard
// (`sends.scheduled_at`). Si no hay ningún envío programado vencido, no hace nada —
// el cron nunca elige una historia por su cuenta solo porque esté "Programado" en Notion.
// Eso evita que, apenas haya RESEND_API_KEY configurada, el cron empiece a mandar
// automáticamente una historia por noche a toda la lista sin que el usuario lo haya
// pedido ese día (decisión explícita del usuario — ver kanban, Notas de decisiones).
const { getPool } = require('./_shared/db');
const { sendNewsletterForPage } = require('./_shared/send-logic');

exports.handler = async () => {
  const db = getPool();
  const siteUrl = process.env.SITE_URL || 'https://vidigoztv.com';

  try {
    const due = await db.query(
      `SELECT id, notion_page_id FROM sends WHERE scheduled_at IS NOT NULL AND scheduled_at <= now() AND sent = false ORDER BY scheduled_at ASC LIMIT 1`
    );

    if (due.rowCount > 0) {
      const row = due.rows[0];
      const result = await sendNewsletterForPage({ notionPageId: row.notion_page_id, sendId: row.id, siteUrl });
      console.log('[newsletter-cron]', `Enviado send programado ${row.id} (notion ${row.notion_page_id})`, JSON.stringify(result));
      return { statusCode: 200, body: JSON.stringify({ ran: true, mode: 'scheduled', result }) };
    }

    console.log('[newsletter-cron] Nada programado vencido en esta corrida.');
    return { statusCode: 200, body: JSON.stringify({ ran: false, reason: 'Nada programado' }) };
  } catch (err) {
    console.error('[newsletter-cron] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
