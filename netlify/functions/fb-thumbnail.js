const https = require('https');
const crypto = require('crypto');

// Sube una portada custom como thumbnail de un video/Reel ya creado en
// Facebook, vía POST /{video_id}/thumbnails?is_preferred=true — un endpoint
// separado de video_reels (que no acepta thumb_url/cover_url, confirmado
// contra la doc oficial de Meta v26.0). Este SÍ acepta una imagen (source)
// como multipart/form-data.
//
// Recibimos la imagen en base64 dentro de un JSON (mismo patrón que
// fb-upload.js — netlify dev es inconsistente con bodies binarios crudos) y
// la reempaquetamos aquí como multipart real para mandarla a graph.facebook.com.

function buildMultipart(fields, fileField, fileBuffer, filename, contentType) {
  const boundary = '----vidiclipBoundary' + crypto.randomBytes(16).toString('hex');
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ));
  }

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  ));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return { body: Buffer.concat(parts), boundary };
}

function postThumbnail(videoId, accessToken, imageBuffer, contentType) {
  const { body, boundary } = buildMultipart(
    { access_token: accessToken, is_preferred: 'true' },
    'source',
    imageBuffer,
    'portada.png',
    contentType
  );

  return new Promise((ok, fail) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path:     `/v19.0/${videoId}/thumbnails`,
      method:   'POST',
      headers: {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => ok({ status: res.statusCode, body: b }));
    });
    req.on('error', fail);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const { videoId, accessToken, imageBase64, contentType } = payload;

  if (!videoId || !accessToken || !imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan videoId, accessToken o imageBase64' }) };
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const result = await postThumbnail(videoId, accessToken, imageBuffer, contentType || 'image/png');

    return {
      statusCode: result.status,
      headers: { 'Content-Type': 'application/json' },
      body: result.body,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
