// ── Basic Auth para /taller/* en producción (Netlify Edge) ──
// La contraseña se lee de la variable de ambiente TALLER_PASSWORD.
// Configúrala en Netlify: Site settings → Environment variables → TALLER_PASSWORD
// (localmente, netlify dev la toma del .env raíz: taller = "...").
//
// Cualquier usuario es válido; solo se compara la contraseña — igual que server.js.

export default async (request, context) => {
  const PASSWORD =
    Netlify.env.get('TALLER_PASSWORD') || Netlify.env.get('taller') || '';

  // Si no hay contraseña configurada, no bloquea (evita candado sin llave).
  if (!PASSWORD) return context.next();

  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (pass === PASSWORD) return context.next();
    } catch {
      // credenciales malformadas → cae al 401
    }
  }

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Taller — VidigozTV</title>' +
      '<body style="font-family:system-ui;background:#0c0c0e;color:#eee;display:grid;place-items:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h1>🔒 Taller</h1>' +
      '<p>Acceso restringido. Ingresa la contraseña para continuar.</p></div>',
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Taller - VidigozTV", charset="UTF-8"',
        'Content-Type': 'text/html; charset=utf-8',
      },
    }
  );
};

export const config = { path: ['/taller', '/taller/*'] };
