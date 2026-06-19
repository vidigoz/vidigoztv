const crypto = require('crypto');
const https  = require('https');

function hmac(key, msg, enc) {
  return crypto.createHmac('sha256', key).update(msg).digest(enc || undefined);
}
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, date), region), service), 'aws4_request');
}

async function uploadR2(accessKey, secretKey, endpoint, bucket, filename, buffer, contentType) {
  const fullUrl   = `${endpoint.replace(/\/$/, '')}/${bucket}/${filename}`;
  const u         = new URL(fullUrl);
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const region    = 'auto';
  const service   = 's3';
  const payHash   = sha256(buffer);
  const scope     = `${dateStamp}/${region}/${service}/aws4_request`;

  const hdrMap = {
    'content-type':          contentType,
    'host':                  u.host,
    'x-amz-content-sha256':  payHash,
    'x-amz-date':            amzDate,
  };
  const sortedKeys = Object.keys(hdrMap).sort();
  const canonHStr  = sortedKeys.map(k => `${k}:${hdrMap[k]}`).join('\n') + '\n';
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
        'Content-Type':          contentType,
        'Content-Length':        buffer.length,
        'x-amz-date':            amzDate,
        'x-amz-content-sha256':  payHash,
        'Authorization':         auth,
      },
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers     = event.headers;
  const accessKey   = headers['x-access-key'];
  const secretKey   = headers['x-secret-key'];
  const endpoint    = headers['x-endpoint'];
  const bucket      = headers['x-bucket']       || 'vidiclip-videos';
  const filename    = headers['x-filename']     || `video_${Date.now()}.webm`;
  const contentType = headers['x-content-type'] || 'video/webm';
  const publicBase  = headers['x-public-url']   || '';

  if (!accessKey || !secretKey || !endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan credenciales R2' }) };
  }

  try {
    const buffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    await uploadR2(accessKey, secretKey, endpoint, bucket, filename, buffer, contentType);

    const publicURL = publicBase
      ? `${publicBase.replace(/\/$/, '')}/${filename}`
      : `${endpoint.replace(/\/$/, '')}/${bucket}/${filename}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: publicURL }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
