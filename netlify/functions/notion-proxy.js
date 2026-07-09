const https = require('https');

// Proxy genérico para la API de Notion.
// Vidiclip llama a /.netlify/functions/notion-proxy/databases/{id}/query
// con el token en el header x-notion-token y el body en JSON.

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
      body: '',
    };
  }

  // Extraer la subruta: /databases/{id}/query, /pages, etc.
  // event.path es algo como /.netlify/functions/notion-proxy/databases/abc123/query
  const fnPrefix = '/.netlify/functions/notion-proxy';
  const notionPath = '/v1' + (event.path.replace(fnPrefix, '') || '/');

  const token = event.headers['x-notion-token'] || event.headers['authorization'] || '';

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Falta token de Notion' }) };
  }

  const bodyStr = event.body || '';

  return new Promise((resolve) => {
    const headers = {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request({
      hostname: 'api.notion.com',
      path: notionPath + (event.rawQuery ? '?' + event.rawQuery : ''),
      method: event.httpMethod,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: Buffer.concat(chunks).toString(),
        });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: err.message }) });
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
};
