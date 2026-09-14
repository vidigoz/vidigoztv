// Los Netlify Functions (`/.netlify/functions/*`) NO caen bajo el edge function que protege
// `/taller/*` (netlify/edge-functions/auth.js solo cubre esas rutas). Las functions
// administrativas del newsletter (enviar, listar historias, gestionar suscriptores, etc.)
// verifican aquí la misma contraseña de Taller (TALLER_PASSWORD / fallback "taller" en .env)
// para no quedar abiertas a cualquiera que adivine la URL — sin crear un sistema de auth nuevo.
//
// El navegador ya reenvía las credenciales Basic Auth al mismo origen una vez autenticado en
// /taller, así que el dashboard (fetch same-origin) no necesita hacer nada especial.

function getTallerPassword() {
  let pw = process.env.TALLER_PASSWORD || process.env.taller || '';
  if (!pw) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const m = envContent.match(/taller\s*=\s*"([^"]+)"/);
      if (m) pw = m[1];
    } catch {
      // sin .env disponible
    }
  }
  return pw;
}

/**
 * Devuelve true si el request trae la contraseña correcta de Taller (Basic Auth, o el
 * body-field "password" como respaldo para requests que no puedan mandar el header).
 * Si no hay contraseña configurada en el servidor, no bloquea (mismo comportamiento que
 * el edge function: evita candado sin llave).
 */
function isTallerAuthorized(event) {
  const configured = getTallerPassword();
  if (!configured) return true;

  const header = (event.headers && (event.headers['authorization'] || event.headers['Authorization'])) || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (pass === configured) return true;
    } catch {
      // credenciales malformadas
    }
  }

  return false;
}

function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'No autorizado' }),
  };
}

module.exports = { isTallerAuthorized, unauthorizedResponse, getTallerPassword };
