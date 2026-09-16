// /.netlify/functions/newsletter-sends
// GET  ?scope=scheduled  → sends con scheduled_at futuro y sent=false (pantalla "Programados")
// GET  ?scope=history    → sends ya enviados, con open/click rate (pantalla "Historial")
// POST { action: 'schedule', notionPageId, scheduledAt, subject? } → crea/actualiza fila en sends
// POST { action: 'cancel', sendId } → scheduled_at = NULL (vuelve a manual)
const { getPool } = require('./_shared/db');
const { isTallerAuthorized, unauthorizedResponse } = require('./_shared/taller-auth');

async function withRates(db, sends) {
  const ids = sends.map((s) => s.id);
  if (ids.length === 0) return sends;

  const r = await db.query(
    `SELECT send_id,
            count(*)::int AS recipients,
            count(delivered_at)::int AS delivered,
            count(opened_at)::int AS opened,
            count(first_clicked_at)::int AS clicked,
            count(bounced_at)::int AS bounced,
            count(complained_at)::int AS complained
     FROM send_recipients
     WHERE send_id = ANY($1::uuid[])
     GROUP BY send_id`,
    [ids]
  );
  const byId = {};
  for (const row of r.rows) byId[row.send_id] = row;

  return sends.map((s) => {
    const stats = byId[s.id] || { recipients: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
    const delivered = stats.delivered || 0;
    return {
      ...s,
      stats: {
        ...stats,
        openRate: delivered > 0 ? stats.opened / delivered : 0,
        clickRate: delivered > 0 ? stats.clicked / delivered : 0,
      },
    };
  });
}

exports.handler = async (event) => {
  if (!isTallerAuthorized(event)) return unauthorizedResponse();
  const db = getPool();

  if (event.httpMethod === 'GET') {
    const qs = event.queryStringParameters || {};
    const scope = qs.scope || 'scheduled';

    try {
      if (scope === 'scheduled') {
        const r = await db.query(
          `SELECT * FROM sends WHERE scheduled_at IS NOT NULL AND scheduled_at > now() AND sent = false ORDER BY scheduled_at ASC`
        );
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sends: r.rows }) };
      }

      if (scope === 'history') {
        const r = await db.query(`SELECT * FROM sends WHERE sent = true ORDER BY sent_at DESC LIMIT 100`);
        const withStats = await withRates(db, r.rows);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sends: withStats }) };
      }

      return { statusCode: 400, body: JSON.stringify({ error: 'scope inválido' }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    try {
      if (body.action === 'schedule') {
        const { notionPageId, scheduledAt, subject } = body;
        const resendMode = body.resendMode === 'all' ? 'all' : 'onlyNew';
        if (!notionPageId || !scheduledAt) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Faltan notionPageId o scheduledAt' }) };
        }

        // Reusar fila existente no enviada para esta historia, si la hay — pero solo cuando
        // esa historia nunca se envió (primer envío). Si ya tiene un `sends.sent = true` previo,
        // esto es un REENVÍO: siempre crea una fila nueva e independiente (nunca reutiliza una
        // ya completada) y guarda resend_mode para que el cron sepa a quién mandárselo.
        const alreadySent = await db.query('SELECT id FROM sends WHERE notion_page_id = $1 AND sent = true LIMIT 1', [notionPageId]);
        const isResend = alreadySent.rowCount > 0;

        const existing = isResend
          ? { rowCount: 0 }
          : await db.query('SELECT id FROM sends WHERE notion_page_id = $1 AND sent = false LIMIT 1', [notionPageId]);
        let row;
        if (existing.rowCount > 0) {
          const upd = await db.query(
            `UPDATE sends SET scheduled_at = $2, subject = COALESCE($3, subject) WHERE id = $1 RETURNING *`,
            [existing.rows[0].id, scheduledAt, subject || null]
          );
          row = upd.rows[0];
        } else {
          const ins = await db.query(
            `INSERT INTO sends (notion_page_id, subject, scheduled_at, resend_mode) VALUES ($1, $2, $3, $4) RETURNING *`,
            [notionPageId, subject || null, scheduledAt, isResend ? resendMode : null]
          );
          row = ins.rows[0];
        }

        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, send: row }) };
      }

      if (body.action === 'cancel') {
        const { sendId } = body;
        if (!sendId) return { statusCode: 400, body: JSON.stringify({ error: 'Falta sendId' }) };
        const upd = await db.query(`UPDATE sends SET scheduled_at = NULL WHERE id = $1 AND sent = false RETURNING *`, [sendId]);
        if (upd.rowCount === 0) return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado o ya enviado' }) };
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, send: upd.rows[0] }) };
      }

      return { statusCode: 400, body: JSON.stringify({ error: 'action inválida' }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
