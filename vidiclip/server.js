// vidiclip-server.js — corre con: node server.js
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');

const PORT = 3747;

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

function collectBody(req) {
  return new Promise((ok, fail) => {
    const c = [];
    req.on('data', d => c.push(d));
    req.on('end',  () => ok(Buffer.concat(c)));
    req.on('error', fail);
  });
}

function hmac(key, msg, enc) {
  return crypto.createHmac('sha256', key).update(msg).digest(enc || undefined);
}
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac('AWS4'+secret, date), region), service), 'aws4_request');
}

async function uploadR2(accessKey, secretKey, endpoint, bucket, filename, buffer, contentType) {
  const fullUrl   = `${endpoint.replace(/\/$/,'')}/${bucket}/${filename}`;
  const u         = new URL(fullUrl);
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g,'').slice(0,15)+'Z';
  const dateStamp = amzDate.slice(0,8);
  const region    = 'auto';
  const service   = 's3';
  const payHash   = sha256(buffer);
  const scope     = `${dateStamp}/${region}/${service}/aws4_request`;

  const hdrMap = {
    'content-type':         contentType,
    'host':                 u.host,
    'x-amz-content-sha256': payHash,
    'x-amz-date':           amzDate,
  };
  const sortedKeys = Object.keys(hdrMap).sort();
  const canonHStr  = sortedKeys.map(k=>`${k}:${hdrMap[k]}`).join('\n')+'\n';
  const signedH    = sortedKeys.join(';');
  const canonReq   = ['PUT', u.pathname, '', canonHStr, signedH, payHash].join('\n');
  const sts        = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonReq)].join('\n');
  const sig        = hmac(signingKey(secretKey, dateStamp, region, service), sts, 'hex');
  const auth       = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedH}, Signature=${sig}`;

  return new Promise((ok, fail) => {
    const req = https.request({
      hostname: u.host,
      path:     u.pathname,
      method:   'PUT',
      headers: {
        'Content-Type':         contentType,
        'Content-Length':       buffer.length,
        'x-amz-date':           amzDate,
        'x-amz-content-sha256': payHash,
        'Authorization':        auth,
      }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) ok(b);
        else fail(new Error(`R2 ${res.statusCode}: ${b}`));
      });
    });
    req.on('error', fail);
    req.write(buffer);
    req.end();
  });
}

function metaRequest(path, method, data) {
  const isGet   = method === 'GET';
  const bodyStr = isGet ? '' : JSON.stringify(data);
  return new Promise((ok, fail) => {
    const headers = isGet
      ? {}
      : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) };

    const req = https.request({
      hostname: 'graph.facebook.com',
      path:     path,
      method:   method,
      headers,
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => ok({ status: res.statusCode, body: b }));
    });
    req.on('error', fail);
    if (!isGet) req.write(bodyStr);
    req.end();
  });
}

http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /ping
  if (url.pathname === '/ping') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET/HEAD /asset?file=personaje.mp4  — serve local asset files
  if (url.pathname === '/asset' && (req.method === 'GET' || req.method === 'HEAD')) {
    const filename = url.searchParams.get('file');
    if (!filename || filename.includes('..') || filename.includes('/')) {
      res.writeHead(400); res.end('Invalid filename'); return;
    }
    const path = require('path');
    const fs2  = require('fs');
    const filePath = path.join(__dirname, filename);
    if (!fs2.existsSync(filePath)) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end('Not found'); return;
    }
    const ext  = path.extname(filename).toLowerCase();
    const mime = { '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.png': 'image/png', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav' }[ext] || 'application/octet-stream';
    const stat = fs2.statSync(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size, 'Access-Control-Allow-Origin': '*' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs2.createReadStream(filePath).pipe(res);
    console.log(`📁 Serving asset: ${filename} (${(stat.size/1024/1024).toFixed(1)} MB)`);
    return;
  }

  // POST /upload
  if (url.pathname === '/upload' && req.method === 'POST') {
    try {
      const accessKey   = req.headers['x-access-key'];
      const secretKey   = req.headers['x-secret-key'];
      const endpoint    = req.headers['x-endpoint'];
      const bucket      = req.headers['x-bucket']       || 'vidiclip-videos';
      const filename    = req.headers['x-filename']     || `video_${Date.now()}.webm`;
      const contentType = req.headers['x-content-type'] || 'video/webm';
      const publicBase  = req.headers['x-public-url']   || '';

      if (!accessKey || !secretKey || !endpoint) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: 'Faltan credenciales R2 (x-access-key, x-secret-key, x-endpoint)' }));
        return;
      }

      console.log(`\n📤 Subiendo ${filename}...`);
      const buf = await collectBody(req);
      console.log(`   Tamaño: ${(buf.length/1024/1024).toFixed(2)} MB`);

      await uploadR2(accessKey, secretKey, endpoint, bucket, filename, buf, contentType);

      const publicURL = publicBase
        ? `${publicBase.replace(/\/$/,'')}/${filename}`
        : `${endpoint.replace(/\/$/,'')}/${bucket}/${filename}`;

      console.log(`✅ Subido: ${publicURL}`);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ url: publicURL }));

    } catch(e) {
      console.error('❌ Upload error:', e.message);
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /meta
  if (url.pathname === '/meta' && req.method === 'POST') {
    try {
      const buf     = await collectBody(req);
      const payload = JSON.parse(buf.toString());
      console.log(`\n📡 Meta: ${payload.method} ${payload.path}`);
      const result  = await metaRequest(payload.path, payload.method || 'POST', payload.data || {});
      console.log(`   Status: ${result.status}`);
      res.writeHead(result.status, {'Content-Type':'application/json'});
      res.end(result.body);
    } catch(e) {
      console.error('❌ Meta error:', e.message);
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /fb-upload — proxy binary video upload to Facebook's upload_url
  if (url.pathname === '/fb-upload' && req.method === 'POST') {
    try {
      const uploadUrl   = req.headers['x-upload-url'];
      const contentType = req.headers['x-content-type'] || 'video/mp4';
      const fileSize    = req.headers['x-file-size'];
      const accessToken = req.headers['x-access-token'];

      if (!uploadUrl) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: 'Falta x-upload-url' }));
        return;
      }

      console.log(`\n📤 FB upload → ${uploadUrl.slice(0, 80)}...`);
      const buf = await collectBody(req);
      console.log(`   Tamaño: ${(buf.length/1024/1024).toFixed(2)} MB, tipo: ${contentType}`);

      const u = new URL(uploadUrl);
      const isHttps = u.protocol === 'https:';
      const lib = isHttps ? https : http;

      const result = await new Promise((ok, fail) => {
        const headers = {
          'Content-Type':   contentType,
          'Content-Length': buf.length,
          'offset':         '0',
          'file_size':      fileSize || buf.length,
        };
        if (accessToken) headers['Authorization'] = `OAuth ${accessToken}`;

        const fbReq = lib.request({
          hostname: u.hostname,
          path:     u.pathname + u.search,
          method:   'POST',
          headers,
        }, fbRes => {
          let b = '';
          fbRes.on('data', d => b += d);
          fbRes.on('end', () => ok({ status: fbRes.statusCode, body: b }));
        });
        fbReq.on('error', fail);
        fbReq.write(buf);
        fbReq.end();
      });

      console.log(`   FB upload status: ${result.status}`);
      if (result.body) console.log(`   FB response: ${result.body.slice(0, 200)}`);
      res.writeHead(result.status, {'Content-Type':'application/json'});
      res.end(result.body || JSON.stringify({ ok: true }));
    } catch(e) {
      console.error('❌ FB upload error:', e.message);
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /notion/* — proxy to Notion API
  if (url.pathname.startsWith('/notion/')) {
    try {
      const notionPath = url.pathname.replace('/notion', '');
      const token = req.headers['x-notion-token'];
      if (!token) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: 'Falta x-notion-token' }));
        return;
      }
      const buf = req.method === 'POST' ? await collectBody(req) : null;
      const notionRes = await new Promise((ok, fail) => {
        const body = buf && buf.length ? buf : null;
        const headers = {
          'Authorization': token,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        };
        if (body) headers['Content-Length'] = body.length;
        const nReq = https.request({
          hostname: 'api.notion.com',
          path: notionPath + (url.search || ''),
          method: req.method,
          headers,
        }, nRes => {
          const chunks = [];
          nRes.on('data', d => chunks.push(d));
          nRes.on('end', () => ok({ status: nRes.statusCode, body: Buffer.concat(chunks).toString() }));
        });
        nReq.on('error', fail);
        if (body) nReq.write(body);
        nReq.end();
      });
      console.log(`📋 Notion ${req.method} ${notionPath} → ${notionRes.status}`);
      res.writeHead(notionRes.status, {'Content-Type':'application/json'});
      res.end(notionRes.body);
    } catch(e) {
      console.error('❌ Notion proxy error:', e.message);
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');

}).listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  🎬  Vidiclip Server v1.1                ║
║  Corriendo en http://localhost:${PORT}     ║
║                                          ║
║  /ping      — health check               ║
║  /upload    — sube video a R2            ║
║  /meta      — proxy Meta Graph API       ║
║  /fb-upload — upload binario a Facebook  ║
║  /notion/*  — proxy Notion API           ║
╚══════════════════════════════════════════╝
  `);
});
