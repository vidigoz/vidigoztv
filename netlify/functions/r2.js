const crypto = require('crypto');

// Genera una URL PUT pre-firmada (SigV4) para subir directo del navegador a
// Cloudflare R2, sin que el binario pase por esta function — evita el límite
// de ~6MB de body en Netlify Functions síncronas.

function hmac(key, msg, enc) {
  return crypto.createHmac('sha256', key).update(msg).digest(enc || undefined);
}
function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, date), region), service), 'aws4_request');
}

function presignPutUrl({ accessKey, secretKey, endpoint, bucket, filename, contentType, expiresSeconds = 300 }) {
  const u         = new URL(`${endpoint.replace(/\/$/, '')}/${bucket}/${encodeURIComponent(filename)}`);
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const region    = 'auto';
  const service   = 's3';
  const scope     = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKey}/${scope}`;

  const query = new URLSearchParams({
    'X-Amz-Algorithm':     'AWS4-HMAC-SHA256',
    'X-Amz-Credential':    credential,
    'X-Amz-Date':          amzDate,
    'X-Amz-Expires':       String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  });
  // Orden alfabético requerido por SigV4 para el query string canónico
  const sortedQuery = new URLSearchParams([...query.entries()].sort(([a], [b]) => a.localeCompare(b)));

  const canonHStr = `host:${u.host}\n`;
  const signedH   = 'host';
  const canonReq  = ['PUT', u.pathname, sortedQuery.toString(), canonHStr, signedH, 'UNSIGNED-PAYLOAD'].join('\n');
  const sts       = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonReq)].join('\n');
  const sig       = hmac(signingKey(secretKey, dateStamp, region, service), sts, 'hex');

  sortedQuery.set('X-Amz-Signature', sig);
  return `${u.origin}${u.pathname}?${sortedQuery.toString()}`;
}

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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const { accessKey, secretKey, endpoint, bucket, filename, contentType, publicUrl } = payload;

  if (!accessKey || !secretKey || !endpoint || !filename) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan credenciales R2 o filename' }) };
  }

  try {
    const uploadUrl = presignPutUrl({
      accessKey, secretKey, endpoint,
      bucket: bucket || 'vidiclip-videos',
      filename,
      contentType: contentType || 'application/octet-stream',
    });

    const publicBase = (publicUrl || '').replace(/\/$/, '');
    const finalUrl = publicBase
      ? `${publicBase}/${filename}`
      : `${endpoint.replace(/\/$/, '')}/${bucket || 'vidiclip-videos'}/${filename}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadUrl, url: finalUrl }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
