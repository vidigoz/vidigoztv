const https = require('https');

// Proxy binario para subir el video a Facebook por CHUNKS, reenviando cada
// pedazo a la upload_url que devuelve video_reels (upload_phase: start).
//
// Por qué por chunks: rupload.facebook.com no permite CORS desde el
// navegador (bloquea la subida directa), así que hay que pasar por esta
// Function — pero las Netlify Functions síncronas (AWS Lambda) limitan el
// body de entrada a ~6MB, muy por debajo de lo que pesa un Reel real
// (~15-25MB). Facebook sí soporta archivos grandes vía su protocolo de
// "resumable upload": se manda el video en varios POST, cada uno con su
// `offset`, y Meta los ensambla del lado del servidor. Partimos el blob en
// el navegador en pedazos de ~4MB y cada uno pasa por aquí individualmente.
//
// Headers esperados desde Vidiclip (uno por chunk):
//   x-upload-url    → URL que devolvió Meta en video_reels (upload_phase: start)
//   x-content-type  → mime del video exportado
//   x-file-size     → tamaño TOTAL en bytes del video completo
//   x-offset        → posición (en bytes) donde empieza este chunk
//   x-access-token  → Page Access Token

function uploadChunkToFacebook(uploadUrl, buffer, contentType, fileSize, offset, accessToken) {
  return new Promise((ok, fail) => {
    const u = new URL(uploadUrl);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'POST',
      headers: {
        'Authorization':   `OAuth ${accessToken}`,
        'offset':          String(offset),
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
  const offset      = headers['x-offset'];
  const accessToken = headers['x-access-token'];

  if (!uploadUrl || !fileSize || offset === undefined || !accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan x-upload-url, x-file-size, x-offset o x-access-token' }) };
  }

  try {
    const buffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    const result = await uploadChunkToFacebook(uploadUrl, buffer, contentType, fileSize, offset, accessToken);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result || JSON.stringify({ success: true }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
