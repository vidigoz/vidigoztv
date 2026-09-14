// Cliente mínimo de Resend (sin dependencia npm — usa fetch nativo de Node 18+/Netlify).
// Lee RESEND_API_KEY de env vars (Netlify) con fallback a .env local, mismo patrón
// que el resto de credenciales del repo (vidigoztv_db_id, integration_token, etc.).

function getResendApiKey() {
  let key = process.env.RESEND_API_KEY || '';
  if (!key) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const m = envContent.match(/^RESEND_API_KEY\s*=\s*(.+)$/m);
      if (m) key = m[1].trim();
    } catch {
      // sin .env disponible — se queda con env vars
    }
  }
  return key;
}

function getResendFrom() {
  let from = process.env.RESEND_FROM || '';
  if (!from) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const m = envContent.match(/^RESEND_FROM\s*=\s*(.+)$/m);
      if (m) from = m[1].trim();
    } catch {
      // sin .env disponible
    }
  }
  return from || 'VidigozTV <newsletter@vidigoztv.com>';
}

/**
 * Envía un correo vía la API HTTP de Resend.
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html }) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, error: 'Falta RESEND_API_KEY en el servidor' };
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getResendFrom(),
        to: [to],
        subject,
        html,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: data.message || `HTTP ${resp.status}` };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { getResendApiKey, getResendFrom, sendEmail };
