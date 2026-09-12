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
// `offset`, y Meta los ensambla del lado del servidor.
//
// El chunk viaja en el BODY como JSON con el binario en base64 (no como
// bytes crudos): el manejo de bodies binarios/ArrayBuffer en `netlify dev`
// es inconsistente — se observó isBase64Encoded=true pero event.body vacío
// al mandar el chunk como binario directo con headers custom. JSON+base64
// es más pesado (~33%) pero funciona igual en local y en producción.

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

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { uploadUrl, contentType, fileSize, offset, accessToken, chunkBase64 } = payload;

  if (!uploadUrl || fileSize === undefined || offset === undefined || !accessToken || !chunkBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan uploadUrl, fileSize, offset, accessToken o chunkBase64' }) };
  }

  try {
    const buffer = Buffer.from(chunkBase64, 'base64');
    console.log(`[fb-upload] chunk offset=${offset} size=${buffer.length} totalSize=${fileSize}`);
    const result = await uploadChunkToFacebook(uploadUrl, buffer, contentType || 'video/webm', fileSize, offset, accessToken);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result || JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('[fb-upload] error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
