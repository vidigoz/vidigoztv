// /.netlify/functions/newsletter-subscribers
// GET  ?format=csv        → exporta CSV de suscriptores activos
// GET  (sin format)        → lista todos con estado y conteo total
// POST { email, nombre? } → alta manual, entra directo como status=active
// POST { emails: [...] }  → import en lote (lista/CSV pegado), todos entran como active
const crypto = require('crypto');
const { getPool } = require('./_shared/db');
const { isTallerAuthorized, unauthorizedResponse } = require('./_shared/taller-auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

exports.handler = async (event) => {
  if (!isTallerAuthorized(event)) return unauthorizedResponse();
  const db = getPool();

  if (event.httpMethod === 'GET') {
    const qs = event.queryStringParameters || {};

    try {
      if (qs.format === 'csv') {
        const r = await db.query(`SELECT email, nombre, created_at FROM subscribers WHERE status = 'active' ORDER BY created_at ASC`);
        const header = 'email,nombre,created_at';
        const rows = r.rows.map((row) => [csvEscape(row.email), csvEscape(row.nombre || ''), csvEscape(row.created_at.toISOString())].join(','));
        const csv = [header, ...rows].join('\n');
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="suscriptores-activos.csv"',
          },
          body: csv,
        };
      }

      const r = await db.query(`SELECT id, email, nombre, status, origen, created_at, confirmed_at FROM subscribers ORDER BY created_at DESC`);
      const counts = await db.query(`SELECT status, count(*)::int AS count FROM subscribers GROUP BY status`);
      const countByStatus = {};
      for (const row of counts.rows) countByStatus[row.status] = row.count;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ subscribers: r.rows, total: r.rows.length, countByStatus }),
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    try {
      // ── Import en lote ──
      if (Array.isArray(body.emails)) {
        const results = { added: 0, skipped: 0, invalid: 0 };
        for (const raw of body.emails) {
          const email = String(raw || '').trim().toLowerCase();
          if (!email) continue;
          if (!EMAIL_RE.test(email)) { results.invalid++; continue; }

          const existing = await db.query('SELECT id, status FROM subscribers WHERE email = $1', [email]);
          if (existing.rowCount > 0) {
            if (existing.rows[0].status !== 'active') {
              await db.query(`UPDATE subscribers SET status = 'active', confirmed_at = now(), origen = 'manual' WHERE id = $1`, [existing.rows[0].id]);
              results.added++;
            } else {
              results.skipped++;
            }
            continue;
          }

          const unsubscribeToken = crypto.randomUUID();
          await db.query(
            `INSERT INTO subscribers (email, status, origen, unsubscribe_token, confirmed_at) VALUES ($1, 'active', 'manual', $2, now())`,
            [email, unsubscribeToken]
          );
          results.added++;
        }
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, ...results }) };
      }

      // ── Alta manual individual ──
      const email = String(body.email || '').trim().toLowerCase();
      const nombre = String(body.nombre || '').trim().slice(0, 200);

      if (!EMAIL_RE.test(email)) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Email inválido' }) };
      }

      const existing = await db.query('SELECT id, status FROM subscribers WHERE email = $1', [email]);
      if (existing.rowCount > 0) {
        await db.query(
          `UPDATE subscribers SET status = 'active', nombre = COALESCE(NULLIF($2, ''), nombre), confirmed_at = COALESCE(confirmed_at, now()) WHERE id = $1`,
          [existing.rows[0].id, nombre]
        );
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadyExisted: true }) };
      }

      const unsubscribeToken = crypto.randomUUID();
      await db.query(
        `INSERT INTO subscribers (email, nombre, status, origen, unsubscribe_token, confirmed_at)
         VALUES ($1, $2, 'active', 'manual', $3, now())`,
        [email, nombre || null, unsubscribeToken]
      );

      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadyExisted: false }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
