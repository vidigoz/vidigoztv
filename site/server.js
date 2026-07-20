const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { Pool } = require(path.join(__dirname, '..', 'netlify', 'functions', 'node_modules', 'pg'));

const PORT = 4000;
const ROOT = __dirname;

// ── Leer configuración de .env ──
let TALLER_PASSWORD = 'admin';
let NOTION_DB_ID = '';
let NOTION_TOKEN = '';
let NEWSLETTER_DB_ID = '';
let VIDIGOZTV_DB_URL = '';

try {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');

  const tallerMatch = envContent.match(/taller\s*=\s*"([^"]+)"/);
  if (tallerMatch) TALLER_PASSWORD = tallerMatch[1];

  const dbMatch = envContent.match(/^db_id\s*=\s*(.+)$/m);
  if (dbMatch) NOTION_DB_ID = dbMatch[1].trim();

  const tokenMatch = envContent.match(/^integration_token\s*=\s*(.+)$/m);
  if (tokenMatch) NOTION_TOKEN = tokenMatch[1].trim();

  const newsletterMatch = envContent.match(/^newsletter_db_id\s*=\s*(.+)$/m);
  if (newsletterMatch) NEWSLETTER_DB_ID = newsletterMatch[1].trim();

  const vidigoztvMatch = envContent.match(/^vidigoztv_db_id\s*=\s*(.+)$/m);
  if (vidigoztvMatch) VIDIGOZTV_DB_URL = vidigoztvMatch[1].trim();

  console.log(`[env] taller=*** db_id=${NOTION_DB_ID ? '✓' : '✗'} integration_token=${NOTION_TOKEN ? '✓' : '✗'} newsletter_db_id=${NEWSLETTER_DB_ID ? '✓' : '✗'} vidigoztv_db_id=${VIDIGOZTV_DB_URL ? '✓' : '✗'}`);
} catch (e) {
  console.log('[!] No se pudo leer .env, usando valores por defecto');
}

let pgPool;
function getPgPool() {
  if (!pgPool) pgPool = new Pool({ connectionString: VIDIGOZTV_DB_URL, max: 3 });
  return pgPool;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.m4a':  'audio/mp4',
  '.ogg':  'audio/ogg',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

// ── Helper: decodificar Basic Auth ──
function parseBasicAuth(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    return { user, pass };
  } catch {
    return null;
  }
}

function requireAuth(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Taller - VidigozTV", charset="UTF-8"',
    'Content-Type': 'text/html; charset=utf-8'
  });
  res.end(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso Restringido</title>
<style>
  body{background:#050410;color:#f2efe9;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .box{text-align:center;max-width:360px;padding:40px}
  h1{font-size:20px;margin-bottom:12px}
  p{color:rgba(255,255,255,.5);font-size:14px;line-height:1.6}
  a{color:#e2632f;text-decoration:none}
</style></head>
<body>
<div class="box">
  <h1>🔒 Taller</h1>
  <p>Acceso restringido. Ingresa la contraseña para continuar.</p>
  <p style="margin-top:24px"><a href="javascript:location.reload()">Intentar de nuevo</a></p>
</div>
</body>
</html>`);
}

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];

  // Normalize trailing slash → index.html
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // ── /taller (hub) → protegido con contraseña ──
  if (urlPath === '/taller' || urlPath === '/taller/') {
    const auth = parseBasicAuth(req);
    if (!auth || auth.pass !== TALLER_PASSWORD) {
      requireAuth(res);
      return;
    }
    serveFile(path.join(__dirname, 'taller/index.html'), res);
    return;
  }

  // ── /taller/* (herramientas) → acceso libre una vez dentro ──
  if (urlPath.startsWith('/taller/')) {
    handleTallerRoute(urlPath, req, res);
    return;
  }

  // ── /.netlify/functions/historias → historias "Programado" desde Notion ──
  if (urlPath === '/.netlify/functions/historias') {
    handleHistorias(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter → alta de suscriptores en Notion ──
  if (urlPath === '/.netlify/functions/newsletter') {
    handleNewsletter(req, res);
    return;
  }

  // ── /.netlify/functions/track → registrar evento de analytics ──
  if (urlPath === '/.netlify/functions/track') {
    handleTrack(req, res);
    return;
  }

  // ── /.netlify/functions/stats → consultar analytics ──
  if (urlPath === '/.netlify/functions/stats') {
    handleStats(req, res);
    return;
  }

  const filePath = path.join(ROOT, urlPath);

  // Security: prevent path traversal outside ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      const withHtml = filePath + '.html';
      fs.stat(withHtml, (err2, stat2) => {
        if (!err2 && stat2.isFile()) {
          serveFile(withHtml, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!DOCTYPE html><html><body style="background:#0a0908;color:#7a7163;font-family:serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p style="font-style:italic;font-size:18px;">404 — No está en el Hilado</p></body></html>');
        }
      });
      return;
    }
    serveFile(filePath, res);
  });

}).listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  ✦  Tempoverso                           ║
║  Corriendo en http://localhost:${PORT}       ║
║                                          ║
║  /             — Inicio                  ║
║  /lore         — El Libro del Origen     ║
║  /taller       — Herramientas (privado)  ║
╚══════════════════════════════════════════╝
  `);
});

// ── Servir rutas de taller (ya autenticado) ──
function handleTallerRoute(urlPath, req, res) {
  // /taller/vidiclip → taller/vidiclip/index.html (con inyección de .env)
  if (urlPath === '/taller/vidiclip' || urlPath === '/taller/vidiclip/') {
    serveVidiclip(res);
    return;
  }

  // /taller/vidiclip/asset?file=X → assets locales de vidiclip
  if (urlPath === '/taller/vidiclip/asset') {
    const qs = new URL(req.url, 'http://localhost').searchParams;
    const file = qs.get('file') || '';
    if (!file || file.includes('..') || file.includes('/')) {
      res.writeHead(400); res.end('Invalid'); return;
    }
    const asset = path.join(__dirname, 'taller/vidiclip', file);
    if (!asset.startsWith(path.join(__dirname, 'taller/vidiclip'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    serveFile(asset, res);
    return;
  }

  // /taller/vidiserial
  if (urlPath === '/taller/vidiserial' || urlPath === '/taller/vidiserial/') {
    serveFile(path.join(__dirname, 'taller/vidiserial/index.html'), res);
    return;
  }

  // /taller/vidiwrite
  if (urlPath === '/taller/vidiwrite' || urlPath === '/taller/vidiwrite/') {
    serveFile(path.join(__dirname, 'taller/vidiwrite/index.html'), res);
    return;
  }

  // /taller/analytics
  if (urlPath === '/taller/analytics' || urlPath === '/taller/analytics/') {
    serveFile(path.join(__dirname, 'taller/analytics/index.html'), res);
    return;
  }

  // Servir archivos estáticos dentro de taller (CSS, JS, imágenes, etc.)
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    serveFile(filePath, res);
  });
}

function serveFile(filePath, res) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type':  mime,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600',
  });

  fs.createReadStream(filePath).pipe(res);
}

// ── Notion helpers para /historias ──
function notionRequest(reqPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const apiReq = https.request({
      hostname: 'api.notion.com',
      path: reqPath,
      method: body ? 'POST' : 'GET',
      headers,
    }, (apiRes) => {
      const chunks = [];
      apiRes.on('data', d => chunks.push(d));
      apiRes.on('end', () => {
        try {
          resolve({ status: apiRes.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (e) {
          reject(e);
        }
      });
    });
    apiReq.on('error', reject);
    if (bodyStr) apiReq.write(bodyStr);
    apiReq.end();
  });
}

function formatDbId(raw) {
  const id = raw.replace(/-/g, '');
  return id.length === 32
    ? `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`
    : raw;
}

function getTitle(prop) { return prop?.title?.map(t => t.plain_text).join('') || ''; }
function getRichText(prop) { return prop?.rich_text?.map(t => t.plain_text).join('') || ''; }
function getFileUrl(prop) {
  const files = prop?.files;
  if (!files || files.length === 0) return null;
  const f = files[0];
  return f.type === 'external' ? f.external?.url : f.file?.url || null;
}

function parseHistoriaPage(page) {
  const p = page.properties;
  return {
    id: page.id,
    titulo: getTitle(p['Titulo']),
    historia: getRichText(p['Historia']),
    oficio: getRichText(p['Oficio']),
    lugar: getRichText(p['Lugar']),
    detalles: getRichText(p['Detalles']),
    sopa: getRichText(p['Sopa']),
    anio: p['Año']?.number ?? null,
    categoria: p['Category']?.select?.name || '',
    imagenUrl: getFileUrl(p['Imagen']),
  };
}

async function handleHistorias(req, res) {
  if (!NOTION_DB_ID || !NOTION_TOKEN) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Faltan credenciales de Notion en el servidor' }));
    return;
  }

  const qs = new URL(req.url, 'http://localhost').searchParams;
  const dbId = formatDbId(NOTION_DB_ID);

  try {
    const results = [];
    let cursor;
    do {
      const { status, data } = await notionRequest(`/v1/databases/${dbId}/query`, {
        filter: { property: 'Estado', status: { equals: 'Programado' } },
        sorts: [{ property: 'Fecha de Publicacion', direction: 'descending' }],
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      if (status !== 200) throw new Error(data.message || `HTTP ${status}`);
      results.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    const historias = results.map(parseHistoriaPage);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });

    if (qs.get('random') === 'true') {
      if (historias.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No hay historias programadas' }));
        return;
      }
      const pick = historias[Math.floor(Math.random() * historias.length)];
      res.end(JSON.stringify(pick));
      return;
    }

    res.end(JSON.stringify({ historias }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── /newsletter: alta de suscriptores ──
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ORIGENES = ['historias.html', 'index.html', 'otro'];

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleNewsletter(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }

  if (!NEWSLETTER_DB_ID || !NOTION_TOKEN) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Faltan credenciales de Notion en el servidor' }));
    return;
  }

  let body;
  try {
    body = JSON.parse(await readRequestBody(req));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'JSON inválido' }));
    return;
  }

  const email  = String(body.email || '').trim().toLowerCase();
  const nombre = String(body.nombre || '').trim().slice(0, 200);
  const origen = VALID_ORIGENES.includes(body.origen) ? body.origen : 'otro';

  if (!EMAIL_RE.test(email)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Email inválido' }));
    return;
  }

  const dbId = formatDbId(NEWSLETTER_DB_ID);

  try {
    const { status: qStatus, data: qData } = await notionRequest(`/v1/databases/${dbId}/query`, {
      filter: { property: 'Email', title: { equals: email } },
      page_size: 1,
    });
    if (qStatus !== 200) throw new Error(qData.message || `HTTP ${qStatus}`);

    if (qData.results.length > 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, alreadySubscribed: true }));
      return;
    }

    const { status: cStatus, data: cData } = await notionRequest('/v1/pages', {
      parent: { database_id: dbId },
      properties: {
        Email:  { title: [{ text: { content: email } }] },
        Nombre: nombre ? { rich_text: [{ text: { content: nombre } }] } : { rich_text: [] },
        Origen: { select: { name: origen } },
      },
    });
    if (cStatus !== 200) throw new Error(cData.message || `HTTP ${cStatus}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, alreadySubscribed: false }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Servir Vidiclip con variables de entorno inyectadas ──
function serveVidiclip(res) {
  const filePath = path.join(__dirname, 'taller/vidiclip/index.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // Inyectar script que precarga las variables de Notion desde .env en localStorage
  // solo si el usuario no las ha configurado ya manualmente
  const envScript = `
<script>
(function() {
  const DB_ID  = ${JSON.stringify(NOTION_DB_ID)};
  const TOKEN  = ${JSON.stringify(NOTION_TOKEN)};
  if (DB_ID && !localStorage.getItem('vdc_notionDB')) {
    localStorage.setItem('vdc_notionDB', DB_ID);
  }
  if (TOKEN && !localStorage.getItem('vdc_notionToken')) {
    localStorage.setItem('vdc_notionToken', TOKEN);
  }
  if (DB_ID || TOKEN) {
    console.log('[autoenv] Notion config precargada desde .env');
  }
})();
</script>
`;

  // Insertar justo antes de </body>
  html = html.replace('</body>', envScript + '\n</body>');

  const buf = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type':   'text/html; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control':  'no-cache',
  });
  res.end(buf);
}

// ── /track: registrar evento de analytics ──
const VALID_EVENT_TYPES = ['pageview', 'click'];

function detectDevice(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/mobile|android|iphone/.test(ua)) return 'mobile';
  return 'desktop';
}

async function handleTrack(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }

  if (!VIDIGOZTV_DB_URL) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Falta vidigoztv_db_id en el servidor' }));
    return;
  }

  let body;
  try {
    body = JSON.parse(await readRequestBody(req));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'JSON inválido' }));
    return;
  }

  const sessionId = String(body.sessionId || '').slice(0, 100);
  const eventType = VALID_EVENT_TYPES.includes(body.eventType) ? body.eventType : null;
  const page      = String(body.page || '').slice(0, 200);
  const label     = body.label ? String(body.label).slice(0, 200) : null;
  const referrer  = body.referrer ? String(body.referrer).slice(0, 500) : null;

  if (!sessionId || !eventType || !page) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Faltan campos requeridos' }));
    return;
  }

  const device = detectDevice(req.headers['user-agent']);

  try {
    const db = getPgPool();
    await db.query(
      `INSERT INTO events (session_id, event_type, page, label, referrer, device, country)
       VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
      [sessionId, eventType, page, label, referrer, device]
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── /stats: consultar analytics ──
async function handleStats(req, res) {
  if (!VIDIGOZTV_DB_URL) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Falta vidigoztv_db_id en el servidor' }));
    return;
  }

  const qs = new URL(req.url, 'http://localhost').searchParams;
  const days = Math.min(Math.max(parseInt(qs.get('days'), 10) || 30, 1), 365);

  try {
    const db = getPgPool();
    const interval = `${days} days`;

    const [pageviewsByDay, topPages, deviceBreakdown, topClicks, sessionsTotal, countryBreakdown, recentEvents] = await Promise.all([
      db.query(
        `SELECT date_trunc('day', created_at) AS day, count(*)::int AS count
         FROM events WHERE event_type = 'pageview' AND created_at >= now() - $1::interval
         GROUP BY 1 ORDER BY 1`, [interval]),
      db.query(
        `SELECT page, count(*)::int AS count
         FROM events WHERE event_type = 'pageview' AND created_at >= now() - $1::interval
         GROUP BY page ORDER BY count DESC LIMIT 20`, [interval]),
      db.query(
        `SELECT device, count(*)::int AS count
         FROM events WHERE event_type = 'pageview' AND created_at >= now() - $1::interval
         GROUP BY device ORDER BY count DESC`, [interval]),
      db.query(
        `SELECT label, count(*)::int AS count
         FROM events WHERE event_type = 'click' AND created_at >= now() - $1::interval AND label IS NOT NULL
         GROUP BY label ORDER BY count DESC LIMIT 20`, [interval]),
      db.query(
        `SELECT count(DISTINCT session_id)::int AS count
         FROM events WHERE created_at >= now() - $1::interval`, [interval]),
      db.query(
        `SELECT country, count(*)::int AS count
         FROM events WHERE event_type = 'pageview' AND created_at >= now() - $1::interval AND country IS NOT NULL
         GROUP BY country ORDER BY count DESC LIMIT 15`, [interval]),
      db.query(
        `SELECT event_type, page, label, device, created_at
         FROM events ORDER BY created_at DESC LIMIT 50`),
    ]);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({
      days,
      pageviewsByDay: pageviewsByDay.rows,
      topPages: topPages.rows,
      deviceBreakdown: deviceBreakdown.rows,
      topClicks: topClicks.rows,
      sessionsTotal: sessionsTotal.rows[0]?.count ?? 0,
      countryBreakdown: countryBreakdown.rows,
      recentEvents: recentEvents.rows,
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
