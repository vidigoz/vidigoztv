// GET /.netlify/functions/newsletter-unsubscribe?token=XXX
// Baja instantánea, sin fricción ni preguntas — redirige a una página de confirmación simple.
const { getPool } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const qs = event.queryStringParameters || {};
  const token = String(qs.token || '').trim();

  if (!token) {
    return { statusCode: 302, headers: { Location: '/baja.html?ok=0' } };
  }

  try {
    const db = getPool();
    const result = await db.query(
      `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = now()
       WHERE unsubscribe_token = $1
       RETURNING id`,
      [token]
    );

    if (result.rowCount === 0) {
      return { statusCode: 302, headers: { Location: '/baja.html?ok=0' } };
    }

    return { statusCode: 302, headers: { Location: '/baja.html?ok=1' } };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
