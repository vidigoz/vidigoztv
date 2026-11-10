// ── Login para /taller/* en producción (Netlify Edge) ──
// Contraseñas: TALLER_PASSWORD y, opcionalmente, TALLER_PASSWORD_2 (Netlify → Environment variables;
// en local `netlify dev` las toma del .env raíz: taller = "...", taller2 = "...").
//
// Sin popup: si no hay sesión se muestra el formulario /taller-login.html dentro de la misma
// página. El formulario llama a /.netlify/functions/taller-login, que deja la cookie `taller_auth`.
// Cualquier usuario es válido; solo se compara la contraseña. Basic Auth sigue aceptándose
// por compatibilidad (curl/scripts), pero ya no se solicita al navegador.

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async (request, context) => {
  const PASSWORDS = [
    Netlify.env.get('TALLER_PASSWORD') || Netlify.env.get('taller') || '',
    Netlify.env.get('TALLER_PASSWORD_2') || Netlify.env.get('taller2') || '',
  ].filter(Boolean);

  // Si no hay contraseña configurada, no bloquea (evita candado sin llave).
  if (!PASSWORDS.length) return context.next();

  // 1) Cookie de sesión
  const cm = (request.headers.get('cookie') || '').match(/(?:^|;\s*)taller_auth=([^;]+)/);
  if (cm) {
    for (const p of PASSWORDS) {
      if ((await sha256Hex('vidigoz-taller|' + p)) === cm[1]) return context.next();
    }
  }

  // 2) Basic Auth (compatibilidad)
  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (PASSWORDS.includes(pass)) return context.next();
    } catch {
      // credenciales malformadas → cae al login
    }
  }

  // Navegación → formulario de login en la misma URL. Otros recursos (fetch, media) → 401 sin popup.
  if ((request.headers.get('accept') || '').includes('text/html')) {
    const login = await fetch(new URL('/taller-login.html', request.url));
    return new Response(login.body, {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response('No autorizado', { status: 401, headers: { 'Cache-Control': 'no-store' } });
};

export const config = { path: ['/taller', '/taller/*'] };
