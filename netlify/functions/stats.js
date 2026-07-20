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

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const qs = event.queryStringParameters || {};
  const days = Math.min(Math.max(parseInt(qs.days, 10) || 30, 1), 365);

  try {
    const db = getPool();

    const [
      pageviewsByDay,
      topPages,
      deviceBreakdown,
      topClicks,
      sessionsTotal,
      countryBreakdown,
      recentEvents,
    ] = await Promise.all([
      db.query(
        `SELECT date_trunc('day', created_at) AS day, count(*)::int AS count
         FROM events
         WHERE event_type = 'pageview' AND created_at >= now() - $1::interval
         GROUP BY 1 ORDER BY 1`,
        [`${days} days`]
      ),
      db.query(
        `SELECT page, count(*)::int AS count
         FROM events
         WHERE event_type = 'pageview' AND created_at >= now() - $1::interval
         GROUP BY page ORDER BY count DESC LIMIT 20`,
        [`${days} days`]
      ),
      db.query(
        `SELECT device, count(*)::int AS count
         FROM events
         WHERE event_type = 'pageview' AND created_at >= now() - $1::interval
         GROUP BY device ORDER BY count DESC`,
        [`${days} days`]
      ),
      db.query(
        `SELECT label, count(*)::int AS count
         FROM events
         WHERE event_type = 'click' AND created_at >= now() - $1::interval AND label IS NOT NULL
         GROUP BY label ORDER BY count DESC LIMIT 20`,
        [`${days} days`]
      ),
      db.query(
        `SELECT count(DISTINCT session_id)::int AS count
         FROM events
         WHERE created_at >= now() - $1::interval`,
        [`${days} days`]
      ),
      db.query(
        `SELECT country, count(*)::int AS count
         FROM events
         WHERE event_type = 'pageview' AND created_at >= now() - $1::interval AND country IS NOT NULL
         GROUP BY country ORDER BY count DESC LIMIT 15`,
        [`${days} days`]
      ),
      db.query(
        `SELECT event_type, page, label, device, created_at
         FROM events
         ORDER BY created_at DESC LIMIT 50`
      ),
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        days,
        pageviewsByDay: pageviewsByDay.rows,
        topPages: topPages.rows,
        deviceBreakdown: deviceBreakdown.rows,
        topClicks: topClicks.rows,
        sessionsTotal: sessionsTotal.rows[0]?.count ?? 0,
        countryBreakdown: countryBreakdown.rows,
        recentEvents: recentEvents.rows,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
