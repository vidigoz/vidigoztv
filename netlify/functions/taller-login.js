// Login del Taller: valida la contraseña y entrega una cookie HttpOnly (sin popup de Basic Auth).
// La cookie contiene un hash derivado de la contraseña (ver taller-auth.js); no guarda la contraseña.
const { getTallerPasswords, tallerToken, COOKIE_NAME } = require('./_shared/taller-auth');

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  let password = '';
  try { password = (JSON.parse(event.body || '{}').password) || ''; } catch { /* body inválido */ }

  const configured = getTallerPasswords();
  if (configured.length && !configured.includes(password)) {
    await new Promise((r) => setTimeout(r, 600)); // frena fuerza bruta casual
    return json(401, { error: 'Contraseña incorrecta' });
  }

  const maxAge = 60 * 60 * 24 * 30; // 30 días
  const token = configured.length ? tallerToken(password) : 'open';
  return json(200, { ok: true }, {
    'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  });
};
