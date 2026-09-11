const https = require('https');

// Proxy binario para subir el video a la upload_url que devuelve Facebook
// en el paso "start" de video_reels. Facebook exige el Page Access Token
// en el header Authorization y el tamaño exacto en offset/file_size —
// aquí hacemos un upload simple en un solo request (file_offset: 0).
//
// Headers esperados desde Vidiclip:
//   x-upload-url    → URL que devolvió Meta en video_reels (upload_phase: start)
//   x-content-type  → mime del video exportado
//   x-file-size     → tamaño en bytes del blob
//   x-access-token  → Page Access Token
//
// NOTA: Netlify Functions (Lambda síncrono) limitan el body de la request
// a ~6MB. Para clips cortos (9:16, pocos segundos) suele alcanzar; para
// videos completos más pesados puede fallar con 413 — si pasa, hay que
// migrar esto a una función en modo streaming o subir por chunks.

function uploadToFacebook(uploadUrl, buffer, contentType, fileSize, accessToken) {
  return new Promise((ok, fail) => {
    const u = new URL(uploadUrl);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'POST',
      headers: {
        'Authorization':   `OAuth ${accessToken}`,
        'offset':          '0',
        'file_size':       String(fileSize),
        'Content-Type':    contentType,
        'Content-Length':  buffer.length,
      },
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) ok(b);
        else fail(new Error(`Facebook upload ${res.statusCode}: ${b}`));
      });
    });
    req.on('error', fail);
    req.write(buffer);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers     = event.headers;
  const uploadUrl   = headers['x-upload-url'];
  const contentType = headers['x-content-type'] || 'video/webm';
  const fileSize    = headers['x-file-size'];
  const accessToken = headers['x-access-token'];

  if (!uploadUrl || !fileSize || !accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan x-upload-url, x-file-size o x-access-token' }) };
  }

  try {
    const buffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    const result = await uploadToFacebook(uploadUrl, buffer, contentType, fileSize, accessToken);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result || JSON.stringify({ success: true }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
