const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 4000;
const ROOT = __dirname;

// Rutas especiales que apuntan fuera del directorio del sitio
const ALIASES = {
  '/taller/vidiclip': path.join(__dirname, '../vidiclip/vidiclip-stories.html'),
  '/taller/vidiclip/asset': null, // handled below
};

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

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];

  // Normalize trailing slash → index.html
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // ── /taller/vidiclip → HTML de vidiclip ──
  if (urlPath === '/taller/vidiclip' || urlPath === '/taller/vidiclip/') {
    serveFile(path.join(__dirname, '../vidiclip/vidiclip-stories.html'), res);
    return;
  }

  // ── /taller/vidiclip/asset?file=X → assets locales de vidiclip ──
  if (urlPath === '/taller/vidiclip/asset') {
    const qs   = new URL(req.url, 'http://localhost').searchParams;
    const file = qs.get('file') || '';
    if (!file || file.includes('..') || file.includes('/')) {
      res.writeHead(400); res.end('Invalid'); return;
    }
    const asset = path.join(__dirname, '../vidiclip', file);
    if (!asset.startsWith(path.join(__dirname, '../vidiclip'))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    serveFile(asset, res);
    return;
  }

  // ── /taller/vidiserial → HTML de vidiserial ──
  if (urlPath === '/taller/vidiserial' || urlPath === '/taller/vidiserial/') {
    serveFile(path.join(__dirname, '../vidiserial/index.html'), res);
    return;
  }

  // ── /taller/vidiwrite → HTML de vidiwrite ──
  if (urlPath === '/taller/vidiwrite' || urlPath === '/taller/vidiwrite/') {
    serveFile(path.join(__dirname, '../vidiwrite/public/index.html'), res);
    return;
  }

  const filePath = path.join(ROOT, urlPath);

  // Security: prevent path traversal outside ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try appending .html
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
