const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 4000;
const ROOT = __dirname;

// ── Leer contraseña de .env ──
let TALLER_PASSWORD = 'admin';
try {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/taller\s*=\s*"([^"]+)"/);
  if (match) TALLER_PASSWORD = match[1];
} catch (e) {
  console.log('[!] No se pudo leer .env, usando contraseña por defecto');
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

  // ── PROTEGER /taller/* con Basic Auth ──
  if (urlPath.startsWith('/taller')) {
    const auth = parseBasicAuth(req);
    if (!auth || auth.pass !== TALLER_PASSWORD) {
      requireAuth(res);
      return;
    }
    // Autenticado: servir archivos de taller
    handleTallerRoute(urlPath, req, res);
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
  // /taller/vidiclip → taller/vidiclip/index.html
  if (urlPath === '/taller/vidiclip' || urlPath === '/taller/vidiclip/') {
    serveFile(path.join(__dirname, 'taller/vidiclip/index.html'), res);
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