const { Pool } = require('pg');

let pool;
function getPool() {
  if (pool) return pool;

  let connectionString = process.env.vidigoztv_db_id || '';
  if (!connectionString) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const m = envContent.match(/^vidigoztv_db_id\s*=\s*(.+)$/m);
      if (m) connectionString = m[1].trim();
    } catch {
      // sin .env disponible — se queda con env vars
    }
  }

  pool = new Pool({ connectionString, max: 3 });
  return pool;
}

const VALID_EVENT_TYPES = ['pageview', 'click'];

function detectDevice(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/mobile|android|iphone/.test(ua)) return 'mobile';
  return 'desktop';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const sessionId  = String(body.sessionId || '').slice(0, 100);
  const eventType  = VALID_EVENT_TYPES.includes(body.eventType) ? body.eventType : null;
  const page       = String(body.page || '').slice(0, 200);
  const label      = body.label ? String(body.label).slice(0, 200) : null;
  const referrer   = body.referrer ? String(body.referrer).slice(0, 500) : null;

  if (!sessionId || !eventType || !page) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Faltan campos requeridos' }) };
  }

  const userAgent = event.headers['user-agent'] || '';
  const device = detectDevice(userAgent);
  const country = event.headers['x-country'] || event.headers['x-nf-geo-country'] || null;

  try {
    const db = getPool();
    await db.query(
      `INSERT INTO events (session_id, event_type, page, label, referrer, device, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, eventType, page, label, referrer, device, country]
    );

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
