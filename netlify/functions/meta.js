const https = require('https');
const querystring = require('querystring');

// Proxy genérico a la Graph API de Meta (graph.facebook.com).
// Vidiclip manda { path, method, data } y aquí reenviamos:
// - GET  → los params van en el query string.
// - POST → los params van como application/x-www-form-urlencoded en el
//   body (la Graph API NO acepta JSON body en sus endpoints REST clásicos
//   como /media, /video_reels, /media_publish — con JSON responde un
//   error sin "id", que es lo que causaba el `undefined` en el container).

function metaRequest(path, method, data) {
  const isGet = method === 'GET';
  const qs    = data && Object.keys(data).length ? querystring.stringify(data) : '';
  const fullPath = isGet && qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
  const bodyStr  = isGet ? '' : qs;

  return new Promise((ok, fail) => {
    const headers = isGet
      ? {}
      : { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(bodyStr) };

    const req = https.request({
      hostname: 'graph.facebook.com',
      path: fullPath,
      method,
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  if (!payload.path) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta "path"' }) };
  }

  try {
    const result = await metaRequest(
      payload.path,
      payload.method || 'POST',
      payload.data || {}
    );
    return {
      statusCode: result.status,
      headers: { 'Content-Type': 'application/json' },
      body: result.body,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
