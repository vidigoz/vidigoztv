const https = require('https');

function metaRequest(path, method, data) {
  const isGet   = method === 'GET';
  const bodyStr = isGet ? '' : JSON.stringify(data);
  return new Promise((ok, fail) => {
    const headers = isGet
      ? {}
      : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) };

    const req = https.request({
      hostname: 'graph.facebook.com',
      path,
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
