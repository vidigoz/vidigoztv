// GET /.netlify/functions/newsletter-confirm?token=XXX
// Confirma un opt-in: pasa el suscriptor de pending → active y redirige a una
// página bonita del sitio.
const { getPool } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const qs = event.queryStringParameters || {};
  const token = String(qs.token || '').trim();

  if (!token) {
    return { statusCode: 302, headers: { Location: '/confirmado.html?ok=0' } };
  }

  try {
    const db = getPool();
    const result = await db.query(
      `UPDATE subscribers SET status = 'active', confirmed_at = now()
       WHERE confirm_token = $1 AND status = 'pending'
       RETURNING id`,
      [token]
    );

    if (result.rowCount === 0) {
      // Puede que ya estuviera confirmado (doble clic) — tratamos como éxito si el token existe.
      const already = await db.query(`SELECT id FROM subscribers WHERE confirm_token = $1 AND status = 'active'`, [token]);
      if (already.rowCount > 0) {
        return { statusCode: 302, headers: { Location: '/confirmado.html?ok=1' } };
      }
      return { statusCode: 302, headers: { Location: '/confirmado.html?ok=0' } };
    }

    return { statusCode: 302, headers: { Location: '/confirmado.html?ok=1' } };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
