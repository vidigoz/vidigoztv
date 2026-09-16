const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { Pool } = require(path.join(__dirname, '..', 'netlify', 'functions', 'node_modules', 'pg'));

const PORT = 4000;
const ROOT = __dirname;

// ── Leer configuración de .env ──
let TALLER_PASSWORD = 'admin';
let NOTION_DB_ID = '';
let NOTION_TOKEN = '';
let NEWSLETTER_DB_ID = '';
let VIDIGOZTV_DB_URL = '';
let RESEND_API_KEY = '';
let RESEND_FROM = '';
let RESEND_WEBHOOK_SECRET = '';
let SITE_URL_ENV = '';

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

  const resendKeyMatch = envContent.match(/^RESEND_API_KEY\s*=\s*(.+)$/m);
  if (resendKeyMatch) RESEND_API_KEY = resendKeyMatch[1].trim();

  const resendFromMatch = envContent.match(/^RESEND_FROM\s*=\s*(.+)$/m);
  if (resendFromMatch) RESEND_FROM = resendFromMatch[1].trim();

  const resendWebhookMatch = envContent.match(/^RESEND_WEBHOOK_SECRET\s*=\s*(.+)$/m);
  if (resendWebhookMatch) RESEND_WEBHOOK_SECRET = resendWebhookMatch[1].trim();

  const siteUrlMatch = envContent.match(/^SITE_URL\s*=\s*(.+)$/m);
  if (siteUrlMatch) SITE_URL_ENV = siteUrlMatch[1].trim();

  console.log(`[env] taller=*** db_id=${NOTION_DB_ID ? '✓' : '✗'} integration_token=${NOTION_TOKEN ? '✓' : '✗'} newsletter_db_id=${NEWSLETTER_DB_ID ? '✓' : '✗'} vidigoztv_db_id=${VIDIGOZTV_DB_URL ? '✓' : '✗'} RESEND_API_KEY=${RESEND_API_KEY ? '✓' : '✗'}`);
} catch (e) {
  console.log('[!] No se pudo leer .env, usando valores por defecto');
}

function getSiteUrlFromReq(req) {
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = req.headers['x-forwarded-proto'] || (host && host.includes('localhost') ? 'http' : 'https');
  if (host) return `${proto}://${host}`;
  return SITE_URL_ENV || 'http://localhost:4000';
}

function isTallerAuthorizedReq(req) {
  if (!TALLER_PASSWORD) return true;
  const auth = parseBasicAuth(req);
  return !!auth && auth.pass === TALLER_PASSWORD;
}

// ── Resend: envío mínimo vía fetch (mismo patrón que _resend.js) ──
async function resendSendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) return { ok: false, error: 'Falta RESEND_API_KEY en el servidor' };
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM || 'VidigozTV <newsletter@vidigoztv.com>', to: [to], subject, html }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: data.message || `HTTP ${resp.status}` };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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

  // ── /.netlify/functions/newsletter-confirm → confirma double opt-in ──
  if (urlPath === '/.netlify/functions/newsletter-confirm') {
    handleNewsletterConfirm(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter-unsubscribe → baja instantánea ──
  if (urlPath === '/.netlify/functions/newsletter-unsubscribe') {
    handleNewsletterUnsubscribe(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter-notion-list → historias "Programado" + estado de envío ──
  if (urlPath === '/.netlify/functions/newsletter-notion-list') {
    handleNewsletterNotionList(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter-preview → HTML del correo para una historia ──
  if (urlPath === '/.netlify/functions/newsletter-preview') {
    handleNewsletterPreview(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter-send → enviar historia por correo ──
  if (urlPath === '/.netlify/functions/newsletter-send') {
    handleNewsletterSend(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter-sends → programar/cancelar/listar envíos ──
  if (urlPath === '/.netlify/functions/newsletter-sends') {
    handleNewsletterSends(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter-subscribers → listar/alta manual/import/export ──
  if (urlPath === '/.netlify/functions/newsletter-subscribers') {
    handleNewsletterSubscribers(req, res);
    return;
  }

  // ── /.netlify/functions/newsletter-webhook → eventos de Resend ──
  if (urlPath === '/.netlify/functions/newsletter-webhook') {
    handleNewsletterWebhook(req, res);
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

  // /taller/newsletter
  if (urlPath === '/taller/newsletter' || urlPath === '/taller/newsletter/') {
    serveFile(path.join(__dirname, 'taller/newsletter/index.html'), res);
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

// ── /newsletter: alta de suscriptores (double opt-in, Postgres) ──
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ORIGENES = ['historias.html', 'index.html', 'manual', 'otro'];

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function confirmEmailHtmlLocal({ nombre, confirmLink }) {
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirma tu suscripción</title></head>
<body style="margin:0;padding:0;background-color:#050410;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050410;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
      <tr><td style="padding:0 0 24px;text-align:center;">
        <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:.12em;color:#f2efe9;">VIDIGOZTV</span>
        <div style="width:40px;height:2px;background-color:#e2632f;margin:10px auto 0;border-radius:1px;"></div>
      </td></tr>
      <tr><td style="background-color:#16142a;border-radius:18px;padding:28px 26px;text-align:center;">
        <h1 style="margin:0 0 14px;font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:20px;color:#f2efe9;">Confirma tu suscripción</h1>
        <p style="margin:0 0 20px;font-family:'Manrope',Arial,sans-serif;font-size:14.5px;line-height:1.6;color:rgba(242,239,233,.75);">${saludo} falta un paso para recibir las historias de VidigozTV en tu correo.</p>
        <a href="${confirmLink}" style="display:inline-block;background-color:#e2632f;color:#050410;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:10px;">Confirmar suscripción</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function handleNewsletter(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
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

  const db = getPgPool();
  const siteUrl = getSiteUrlFromReq(req);

  try {
    const existing = await db.query('SELECT id, status FROM subscribers WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status === 'active') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, alreadySubscribed: true }));
        return;
      }

      const confirmToken = crypto.randomUUID();
      if (row.status === 'pending') {
        await db.query(`UPDATE subscribers SET nombre = $2, origen = $3, confirm_token = $4 WHERE id = $1`, [row.id, nombre || null, origen, confirmToken]);
      } else {
        const unsubscribeToken = crypto.randomUUID();
        await db.query(`UPDATE subscribers SET status = 'pending', nombre = $2, origen = $3, confirm_token = $4, unsubscribe_token = $5 WHERE id = $1`, [row.id, nombre || null, origen, confirmToken, unsubscribeToken]);
      }

      const confirmLink = `${siteUrl}/.netlify/functions/newsletter-confirm?token=${confirmToken}`;
      const emailResult = await resendSendEmail({ to: email, subject: 'Confirma tu suscripción a VidigozTV', html: confirmEmailHtmlLocal({ nombre, confirmLink }) });
      if (!emailResult.ok) console.error('[newsletter] error enviando confirmación:', emailResult.error);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, alreadySubscribed: false }));
      return;
    }

    const confirmToken = crypto.randomUUID();
    const unsubscribeToken = crypto.randomUUID();
    await db.query(
      `INSERT INTO subscribers (email, nombre, status, origen, confirm_token, unsubscribe_token) VALUES ($1, $2, 'pending', $3, $4, $5)`,
      [email, nombre || null, origen, confirmToken, unsubscribeToken]
    );

    const confirmLink = `${siteUrl}/.netlify/functions/newsletter-confirm?token=${confirmToken}`;
    const emailResult = await resendSendEmail({ to: email, subject: 'Confirma tu suscripción a VidigozTV', html: confirmEmailHtmlLocal({ nombre, confirmLink }) });
    if (!emailResult.ok) console.error('[newsletter] error enviando confirmación:', emailResult.error);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, alreadySubscribed: false }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── /newsletter-confirm: confirma double opt-in ──
async function handleNewsletterConfirm(req, res) {
  const qs = new URL(req.url, 'http://localhost').searchParams;
  const token = (qs.get('token') || '').trim();

  if (!token) { res.writeHead(302, { Location: '/confirmado.html?ok=0' }); res.end(); return; }

  try {
    const db = getPgPool();
    const result = await db.query(
      `UPDATE subscribers SET status = 'active', confirmed_at = now() WHERE confirm_token = $1 AND status = 'pending' RETURNING id`,
      [token]
    );
    if (result.rowCount === 0) {
      const already = await db.query(`SELECT id FROM subscribers WHERE confirm_token = $1 AND status = 'active'`, [token]);
      res.writeHead(302, { Location: already.rowCount > 0 ? '/confirmado.html?ok=1' : '/confirmado.html?ok=0' });
      res.end();
      return;
    }
    res.writeHead(302, { Location: '/confirmado.html?ok=1' });
    res.end();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── /newsletter-unsubscribe: baja instantánea ──
async function handleNewsletterUnsubscribe(req, res) {
  const qs = new URL(req.url, 'http://localhost').searchParams;
  const token = (qs.get('token') || '').trim();

  if (!token) { res.writeHead(302, { Location: '/baja.html?ok=0' }); res.end(); return; }

  try {
    const db = getPgPool();
    const result = await db.query(
      `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = now() WHERE unsubscribe_token = $1 RETURNING id`,
      [token]
    );
    res.writeHead(302, { Location: result.rowCount === 0 ? '/baja.html?ok=0' : '/baja.html?ok=1' });
    res.end();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Helpers de Notion para historias "Programado" (candidatas a newsletter) ──
async function listHistoriasProgramadoLocal() {
  if (!NOTION_DB_ID || !NOTION_TOKEN) throw new Error('Faltan credenciales de Notion en el servidor');
  const dbId = formatDbId(NOTION_DB_ID);
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
  return results.map(parseHistoriaPage).map((h, i) => ({ ...h, fechaPublicacion: results[i].properties['Fecha de Publicacion']?.date?.start || null, lastEditedTime: results[i].last_edited_time, estado: results[i].properties['Estado']?.status?.name || '' }));
}

async function getHistoriaByIdLocal(pageId) {
  if (!NOTION_TOKEN) throw new Error('Falta integration_token en el servidor');
  const { status, data } = await notionRequest(`/v1/pages/${pageId}`);
  if (status !== 200) throw new Error(data.message || `HTTP ${status}`);
  return parseHistoriaPage(data);
}

// ── Plantilla de correo (mismo diseño que _email-template.js) ──
function escapeHtmlLocal(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function textToParagraphsLocal(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;color:#f2efe9;font-family:'Manrope',Arial,sans-serif;font-size:15px;line-height:1.7;">${escapeHtmlLocal(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}
// Íconos de redes sociales: archivos PNG reales en site/icons/ (mismos SVG que usa el
// landing page), servidos por URL — más confiable que data: URI en clientes de correo.
function renderEmailLocal({ titulo, cuerpo, imagenUrl, unsubscribeLink, siteUrl }) {
  const site = siteUrl || 'https://vidigoztv.com';
  const safeTitulo = escapeHtmlLocal(titulo || 'Nueva historia de VidigozTV');
  const bodyHtml = textToParagraphsLocal(cuerpo);
  const imageBlock = imagenUrl ? `<tr><td style="padding:0 0 24px;"><img src="${escapeHtmlLocal(imagenUrl)}" alt="${safeTitulo}" width="100%" style="display:block;width:100%;max-width:548px;border-radius:12px;"></td></tr>` : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitulo}</title></head>
<body style="margin:0;padding:0;background-color:#050410;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050410;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
      <tr><td style="padding:0 0 28px;text-align:center;">
        <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:.12em;color:#f2efe9;">VIDIGOZTV</span>
        <div style="width:40px;height:2px;background-color:#e2632f;margin:10px auto 0;border-radius:1px;"></div>
      </td></tr>
      <tr><td style="background-color:#16142a;border-radius:18px;padding:28px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 20px;"><h1 style="margin:0;font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.3;color:#f2efe9;">${safeTitulo}</h1></td></tr>
          ${imageBlock}
          <tr><td>${bodyHtml}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:8px 0;">&nbsp;</td></tr>
      <tr><td style="background-color:#16142a;border-radius:18px;padding:24px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 4px;"><span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e2632f;">Síguenos</span></td></tr>
          <tr><td style="padding:6px 0 0;"><p style="margin:0 0 16px;color:rgba(242,239,233,.65);font-family:'Manrope',Arial,sans-serif;font-size:13.5px;line-height:1.6;">Historias medievales nuevas cada semana en tus redes favoritas.</p></td></tr>
          <tr><td>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;"><a href="https://www.facebook.com/vidigoztv"><img src="${site}/icons/newsletter-social-fb.png" width="40" height="40" alt="Facebook" style="display:block;border-radius:10px;"></a></td>
              <td style="padding-right:10px;"><a href="https://www.instagram.com/vidigoztv/"><img src="${site}/icons/newsletter-social-ig.png" width="40" height="40" alt="Instagram" style="display:block;border-radius:10px;"></a></td>
              <td><a href="https://www.tiktok.com/@vidigoztv"><img src="${site}/icons/newsletter-social-tt.png" width="40" height="40" alt="TikTok" style="display:block;border-radius:10px;"></a></td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:8px 0;">&nbsp;</td></tr>
      <tr><td style="background-color:#16142a;border-radius:18px;padding:24px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 4px;"><span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e2632f;">Para jugar</span></td></tr>
          <tr><td style="padding:6px 0 16px;"><p style="margin:0;color:rgba(242,239,233,.65);font-family:'Manrope',Arial,sans-serif;font-size:13.5px;line-height:1.6;">Dos juegos gratis del canal, directo en tu navegador.</p></td></tr>
          <tr><td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="48%" valign="top" style="background-color:#0c0a1c;border-radius:12px;padding:16px;"><span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:600;font-size:14px;color:#f2efe9;">El Sacamuelas</span><br><a href="https://sacamuelas.netlify.app/" style="display:inline-block;margin-top:10px;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:12.5px;color:#e2632f;">Jugar →</a></td>
              <td width="4%">&nbsp;</td>
              <td width="48%" valign="top" style="background-color:#0c0a1c;border-radius:12px;padding:16px;"><span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:600;font-size:14px;color:#f2efe9;">Cerdo Icario</span><br><a href="https://cerdoicario.netlify.app/" style="display:inline-block;margin-top:10px;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:12.5px;color:#e2632f;">Jugar →</a></td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:8px 0;">&nbsp;</td></tr>
      <tr><td style="background-color:#16142a;border-radius:18px;padding:24px 26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 4px;"><span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e2632f;">De la tienda</span></td></tr>
          <tr><td style="padding:6px 0 18px;"><p style="margin:0;color:rgba(242,239,233,.65);font-family:'Manrope',Arial,sans-serif;font-size:13.5px;line-height:1.6;">Lleva el Tempoverso contigo — playeras, tazas y más del canal.</p></td></tr>
          <tr><td><a href="https://vidigoztv.printify.me/" style="display:inline-block;background-color:#e2632f;color:#050410;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:13.5px;text-decoration:none;padding:11px 22px;border-radius:10px;">Ver la tienda →</a></td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:28px 10px 0;text-align:center;">
        <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:13px;letter-spacing:.1em;color:rgba(242,239,233,.5);">VIDIGOZTV</span>
        <p style="margin:10px 0;font-family:'Manrope',Arial,sans-serif;font-size:12.5px;color:rgba(242,239,233,.45);">Recibes este correo porque te suscribiste en <a href="${site}" style="color:#e2632f;text-decoration:none;">${site.replace(/^https?:\/\//, '')}</a></p>
        <p style="margin:0;font-family:'Manrope',Arial,sans-serif;font-size:12.5px;"><a href="${escapeHtmlLocal(unsubscribeLink || '#')}" style="color:rgba(242,239,233,.45);text-decoration:underline;">Darme de baja</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── /newsletter-notion-list ──
async function handleNewsletterNotionList(req, res) {
  if (!isTallerAuthorizedReq(req)) { res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="Taller - VidigozTV", charset="UTF-8"' }); res.end(JSON.stringify({ error: 'No autorizado' })); return; }
  try {
    const historias = await listHistoriasProgramadoLocal();
    const db = getPgPool();
    const ids = historias.map((h) => h.id);
    let sendsByPage = {};
    if (ids.length > 0) {
      const r = await db.query(`SELECT notion_page_id, id, sent, sent_at, scheduled_at, recipients_count FROM sends WHERE notion_page_id = ANY($1::text[]) ORDER BY created_at DESC`, [ids]);
      for (const row of r.rows) if (!sendsByPage[row.notion_page_id]) sendsByPage[row.notion_page_id] = row;
    }
    const items = historias.map((h) => ({ id: h.id, titulo: h.titulo, estado: h.estado, fechaPublicacion: h.fechaPublicacion, lastEditedTime: h.lastEditedTime, send: sendsByPage[h.id] || null }));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ historias: items }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── /newsletter-preview ──
async function handleNewsletterPreview(req, res) {
  if (!isTallerAuthorizedReq(req)) { res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="Taller - VidigozTV", charset="UTF-8"' }); res.end(JSON.stringify({ error: 'No autorizado' })); return; }
  const qs = new URL(req.url, 'http://localhost').searchParams;
  const pageId = qs.get('pageId');
  if (!pageId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Falta pageId' })); return; }
  try {
    const historia = await getHistoriaByIdLocal(pageId);
    const siteUrl = getSiteUrlFromReq(req);
    const html = renderEmailLocal({ titulo: historia.titulo, cuerpo: historia.historia, imagenUrl: historia.imagenUrl, unsubscribeLink: `${siteUrl}/.netlify/functions/newsletter-unsubscribe?token=EJEMPLO`, siteUrl });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Lógica de envío compartida (manual + cron) ──
async function sendNewsletterForPageLocal({ notionPageId, sendId, siteUrl }) {
  const db = getPgPool();
  const site = siteUrl || SITE_URL_ENV || 'https://vidigoztv.com';

  const historia = await getHistoriaByIdLocal(notionPageId);
  const subject = historia.titulo || 'Nueva historia de VidigozTV';

  let send;
  if (sendId) {
    const r = await db.query('SELECT * FROM sends WHERE id = $1', [sendId]);
    if (r.rowCount === 0) throw new Error('sendId no encontrado');
    send = r.rows[0];
    if (send.sent) return { alreadySent: true, sendId: send.id, recipientsCount: send.recipients_count };
    await db.query('UPDATE sends SET subject = $2 WHERE id = $1', [send.id, subject]);
  } else {
    const existing = await db.query('SELECT id, sent FROM sends WHERE notion_page_id = $1 AND sent = true LIMIT 1', [notionPageId]);
    if (existing.rowCount > 0) return { alreadySent: true, sendId: existing.rows[0].id };
    const ins = await db.query(`INSERT INTO sends (notion_page_id, subject) VALUES ($1, $2) RETURNING *`, [notionPageId, subject]);
    send = ins.rows[0];
  }

  const subs = await db.query(
    `SELECT s.id, s.email, s.nombre, s.unsubscribe_token FROM subscribers s
     WHERE s.status = 'active' AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)`,
    [send.id]
  );

  let sentCount = 0, errorCount = 0;
  for (const sub of subs.rows) {
    const unsubscribeLink = `${site}/.netlify/functions/newsletter-unsubscribe?token=${sub.unsubscribe_token}`;
    const html = renderEmailLocal({ titulo: historia.titulo, cuerpo: historia.historia, imagenUrl: historia.imagenUrl, unsubscribeLink, siteUrl: site });
    const result = await resendSendEmail({ to: sub.email, subject, html });
    if (result.ok) {
      await db.query(`INSERT INTO send_recipients (send_id, subscriber_id, resend_email_id, delivered_at) VALUES ($1, $2, $3, now())`, [send.id, sub.id, result.id || null]);
      sentCount++;
    } else {
      errorCount++;
      console.error(`[newsletter-send] error enviando a ${sub.email}:`, result.error);
    }
  }

  const totalRecipients = await db.query('SELECT count(*)::int AS count FROM send_recipients WHERE send_id = $1', [send.id]);
  const finalCount = totalRecipients.rows[0].count;
  const remaining = await db.query(
    `SELECT count(*)::int AS count FROM subscribers s WHERE s.status = 'active' AND NOT EXISTS (SELECT 1 FROM send_recipients sr WHERE sr.send_id = $1 AND sr.subscriber_id = s.id)`,
    [send.id]
  );
  const fullyDone = remaining.rows[0].count === 0;
  if (fullyDone) {
    await db.query(`UPDATE sends SET sent = true, sent_at = now(), recipients_count = $2 WHERE id = $1`, [send.id, finalCount]);
  } else {
    await db.query(`UPDATE sends SET recipients_count = $2 WHERE id = $1`, [send.id, finalCount]);
  }

  return { alreadySent: false, sendId: send.id, sentCount, errorCount, recipientsCount: finalCount, fullyDone };
}

// ── /newsletter-send ──
async function handleNewsletterSend(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }
  if (!isTallerAuthorizedReq(req)) { res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="Taller - VidigozTV", charset="UTF-8"' }); res.end(JSON.stringify({ error: 'No autorizado' })); return; }

  let body = {};
  try { body = JSON.parse(await readRequestBody(req) || '{}'); }
  catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'JSON inválido' })); return; }

  const siteUrl = getSiteUrlFromReq(req);

  try {
    let notionPageId = body.notionPageId;
    const sendId = body.sendId;
    const db = getPgPool();

    if (!notionPageId && !sendId) {
      const historias = await listHistoriasProgramadoLocal();
      let candidate = null;
      for (const h of historias) {
        const existing = await db.query('SELECT id FROM sends WHERE notion_page_id = $1 AND sent = true LIMIT 1', [h.id]);
        if (existing.rowCount === 0) { candidate = h; break; }
      }
      if (!candidate) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No hay historias pendientes de enviar' })); return; }
      notionPageId = candidate.id;
    }

    if (sendId && !notionPageId) {
      const r = await db.query('SELECT notion_page_id FROM sends WHERE id = $1', [sendId]);
      if (r.rowCount === 0) { res.writeHead(404); res.end(JSON.stringify({ error: 'sendId no encontrado' })); return; }
      notionPageId = r.rows[0].notion_page_id;
    }

    const result = await sendNewsletterForPageLocal({ notionPageId, sendId, siteUrl });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...result }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── /newsletter-sends (programar / cancelar / listar) ──
async function handleNewsletterSends(req, res) {
  if (!isTallerAuthorizedReq(req)) { res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="Taller - VidigozTV", charset="UTF-8"' }); res.end(JSON.stringify({ error: 'No autorizado' })); return; }
  const db = getPgPool();

  if (req.method === 'GET') {
    const qs = new URL(req.url, 'http://localhost').searchParams;
    const scope = qs.get('scope') || 'scheduled';
    try {
      if (scope === 'scheduled') {
        const r = await db.query(`SELECT * FROM sends WHERE scheduled_at IS NOT NULL AND scheduled_at > now() AND sent = false ORDER BY scheduled_at ASC`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sends: r.rows }));
        return;
      }
      if (scope === 'history') {
        const r = await db.query(`SELECT * FROM sends WHERE sent = true ORDER BY sent_at DESC LIMIT 100`);
        const ids = r.rows.map((s) => s.id);
        let byId = {};
        if (ids.length > 0) {
          const stats = await db.query(
            `SELECT send_id, count(*)::int AS recipients, count(delivered_at)::int AS delivered, count(opened_at)::int AS opened, count(first_clicked_at)::int AS clicked, count(bounced_at)::int AS bounced, count(complained_at)::int AS complained
             FROM send_recipients WHERE send_id = ANY($1::uuid[]) GROUP BY send_id`,
            [ids]
          );
          for (const row of stats.rows) byId[row.send_id] = row;
        }
        const withStats = r.rows.map((s) => {
          const stats = byId[s.id] || { recipients: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
          const delivered = stats.delivered || 0;
          return { ...s, stats: { ...stats, openRate: delivered > 0 ? stats.opened / delivered : 0, clickRate: delivered > 0 ? stats.clicked / delivered : 0 } };
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sends: withStats }));
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'scope inválido' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'JSON inválido' })); return; }

    try {
      if (body.action === 'schedule') {
        const { notionPageId, scheduledAt, subject } = body;
        if (!notionPageId || !scheduledAt) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Faltan notionPageId o scheduledAt' })); return; }
        const existing = await db.query('SELECT id FROM sends WHERE notion_page_id = $1 AND sent = false LIMIT 1', [notionPageId]);
        let row;
        if (existing.rowCount > 0) {
          const upd = await db.query(`UPDATE sends SET scheduled_at = $2, subject = COALESCE($3, subject) WHERE id = $1 RETURNING *`, [existing.rows[0].id, scheduledAt, subject || null]);
          row = upd.rows[0];
        } else {
          const ins = await db.query(`INSERT INTO sends (notion_page_id, subject, scheduled_at) VALUES ($1, $2, $3) RETURNING *`, [notionPageId, subject || null, scheduledAt]);
          row = ins.rows[0];
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, send: row }));
        return;
      }

      if (body.action === 'cancel') {
        const { sendId } = body;
        if (!sendId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Falta sendId' })); return; }
        const upd = await db.query(`UPDATE sends SET scheduled_at = NULL WHERE id = $1 AND sent = false RETURNING *`, [sendId]);
        if (upd.rowCount === 0) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No encontrado o ya enviado' })); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, send: upd.rows[0] }));
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'action inválida' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(405); res.end('Method Not Allowed');
}

// ── /newsletter-subscribers (listar / alta manual / import / export) ──
function csvEscapeLocal(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function handleNewsletterSubscribers(req, res) {
  if (!isTallerAuthorizedReq(req)) { res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="Taller - VidigozTV", charset="UTF-8"' }); res.end(JSON.stringify({ error: 'No autorizado' })); return; }
  const db = getPgPool();

  if (req.method === 'GET') {
    const qs = new URL(req.url, 'http://localhost').searchParams;
    try {
      if (qs.get('format') === 'csv') {
        const r = await db.query(`SELECT email, nombre, created_at FROM subscribers WHERE status = 'active' ORDER BY created_at ASC`);
        const header = 'email,nombre,created_at';
        const rows = r.rows.map((row) => [csvEscapeLocal(row.email), csvEscapeLocal(row.nombre || ''), csvEscapeLocal(row.created_at.toISOString())].join(','));
        const csv = [header, ...rows].join('\n');
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="suscriptores-activos.csv"' });
        res.end(csv);
        return;
      }
      const r = await db.query(`SELECT id, email, nombre, status, origen, created_at, confirmed_at FROM subscribers ORDER BY created_at DESC`);
      const counts = await db.query(`SELECT status, count(*)::int AS count FROM subscribers GROUP BY status`);
      const countByStatus = {};
      for (const row of counts.rows) countByStatus[row.status] = row.count;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ subscribers: r.rows, total: r.rows.length, countByStatus }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readRequestBody(req)); }
    catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'JSON inválido' })); return; }

    try {
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
            } else { results.skipped++; }
            continue;
          }
          const unsubscribeToken = crypto.randomUUID();
          await db.query(`INSERT INTO subscribers (email, status, origen, unsubscribe_token, confirmed_at) VALUES ($1, 'active', 'manual', $2, now())`, [email, unsubscribeToken]);
          results.added++;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...results }));
        return;
      }

      const email = String(body.email || '').trim().toLowerCase();
      const nombre = String(body.nombre || '').trim().slice(0, 200);
      if (!EMAIL_RE.test(email)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Email inválido' })); return; }

      const existing = await db.query('SELECT id, status FROM subscribers WHERE email = $1', [email]);
      if (existing.rowCount > 0) {
        await db.query(`UPDATE subscribers SET status = 'active', nombre = COALESCE(NULLIF($2, ''), nombre), confirmed_at = COALESCE(confirmed_at, now()) WHERE id = $1`, [existing.rows[0].id, nombre]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, alreadyExisted: true }));
        return;
      }

      const unsubscribeToken = crypto.randomUUID();
      await db.query(`INSERT INTO subscribers (email, nombre, status, origen, unsubscribe_token, confirmed_at) VALUES ($1, $2, 'active', 'manual', $3, now())`, [email, nombre || null, unsubscribeToken]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, alreadyExisted: false }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(405); res.end('Method Not Allowed');
}

// ── /newsletter-webhook (eventos de Resend) ──
async function handleNewsletterWebhook(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }

  let payload;
  try { payload = JSON.parse(await readRequestBody(req)); }
  catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'JSON inválido' })); return; }

  const type = payload.type;
  const data = payload.data || {};
  const resendEmailId = data.email_id || data.id;
  const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;

  if (!type || !resendEmailId) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ignored: true })); return; }

  const db = getPgPool();
  try {
    let recipient;
    const byId = await db.query('SELECT * FROM send_recipients WHERE resend_email_id = $1 LIMIT 1', [resendEmailId]);
    if (byId.rowCount > 0) {
      recipient = byId.rows[0];
    } else if (toEmail) {
      const bySub = await db.query(`SELECT sr.* FROM send_recipients sr JOIN subscribers s ON s.id = sr.subscriber_id WHERE s.email = $1 ORDER BY sr.delivered_at DESC NULLS LAST LIMIT 1`, [toEmail]);
      if (bySub.rowCount > 0) recipient = bySub.rows[0];
    }

    if (type === 'email.delivered' && recipient) await db.query('UPDATE send_recipients SET delivered_at = now() WHERE id = $1', [recipient.id]);
    if (type === 'email.opened' && recipient) await db.query('UPDATE send_recipients SET opened_at = COALESCE(opened_at, now()) WHERE id = $1', [recipient.id]);
    if (type === 'email.clicked' && recipient) await db.query('UPDATE send_recipients SET first_clicked_at = COALESCE(first_clicked_at, now()) WHERE id = $1', [recipient.id]);

    if (type === 'email.bounced') {
      if (recipient) await db.query('UPDATE send_recipients SET bounced_at = now() WHERE id = $1', [recipient.id]);
      if (toEmail) {
        const sub = await db.query(`UPDATE subscribers SET status = 'bounced' WHERE email = $1 RETURNING id`, [toEmail]);
        if (sub.rowCount > 0 && recipient) await db.query(`INSERT INTO send_events (send_id, subscriber_id, event_type) VALUES ($1, $2, 'bounced')`, [recipient.send_id, sub.rows[0].id]);
      }
    }

    if (type === 'email.complained') {
      if (recipient) await db.query('UPDATE send_recipients SET complained_at = now() WHERE id = $1', [recipient.id]);
      if (toEmail) {
        const sub = await db.query(`UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = now() WHERE email = $1 RETURNING id`, [toEmail]);
        if (sub.rowCount > 0 && recipient) await db.query(`INSERT INTO send_events (send_id, subscriber_id, event_type) VALUES ($1, $2, 'complained')`, [recipient.send_id, sub.rows[0].id]);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
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
