// Alta de suscriptores (double opt-in) — reemplaza la versión anterior que escribía
// directo a Notion. Ahora escribe en Postgres (subscribers) y dispara un correo de
// confirmación vía Resend. Mantiene el mismo contrato request/response que el form
// de index.html ya espera: POST {email, nombre, origen} → {success, alreadySubscribed}.
const crypto = require('crypto');
const { getPool } = require('./_db');
const { sendEmail } = require('./_resend');
const { getSiteUrl } = require('./_site-url');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ORIGENES = ['historias.html', 'index.html', 'manual', 'otro'];

function confirmEmailHtml({ nombre, confirmLink, siteUrl }) {
  const saludo = nombre ? `Hola ${nombre},` : 'Hola,';
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirma tu suscripción</title></head>
<body style="margin:0;padding:0;background-color:#050410;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050410;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
      <tr><td style="padding:0 0 24px;text-align:center;">
        <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:.12em;color:#f2efe9;">VIDIGOZTV</span>
        <div style="width:40px;height:2px;background-color:#e2632f;margin:10px auto 0;border-radius:1px;"></div>
      </td></tr>
      <tr><td style="background-color:#16142a;border-radius:18px;padding:28px 26px;text-align:center;">
        <h1 style="margin:0 0 14px;font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:20px;color:#f2efe9;">Confirma tu suscripción</h1>
        <p style="margin:0 0 20px;font-family:'Manrope',Arial,sans-serif;font-size:14.5px;line-height:1.6;color:rgba(242,239,233,.75);">${saludo} falta un paso para recibir las historias de VidigozTV en tu correo.</p>
        <a href="${confirmLink}" style="display:inline-block;background-color:#e2632f;color:#050410;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:10px;">Confirmar suscripción</a>
        <p style="margin:20px 0 0;font-family:'Manrope',Arial,sans-serif;font-size:11.5px;color:rgba(242,239,233,.4);">Si no fuiste tú, ignora este correo.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const email  = String(body.email || '').trim().toLowerCase();
  const nombre = String(body.nombre || '').trim().slice(0, 200);
  const origen = VALID_ORIGENES.includes(body.origen) ? body.origen : 'otro';

  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Email inválido' }) };
  }

  const db = getPool();
  const siteUrl = getSiteUrl(event);

  try {
    const existing = await db.query('SELECT id, status, confirm_token FROM subscribers WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      const row = existing.rows[0];

      if (row.status === 'active') {
        // Ya confirmado — éxito sin fricción, sin reenviar nada.
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadySubscribed: true }) };
      }

      // pending / unsubscribed / bounced → reintenta el opt-in con un token nuevo.
      const confirmToken = crypto.randomUUID();
      const unsubscribeToken = row.status === 'pending' ? undefined : crypto.randomUUID();

      if (unsubscribeToken) {
        await db.query(
          `UPDATE subscribers SET status = 'pending', nombre = $2, origen = $3, confirm_token = $4, unsubscribe_token = $5 WHERE id = $1`,
          [row.id, nombre || null, origen, confirmToken, unsubscribeToken]
        );
      } else {
        await db.query(
          `UPDATE subscribers SET status = 'pending', nombre = $2, origen = $3, confirm_token = $4 WHERE id = $1`,
          [row.id, nombre || null, origen, confirmToken]
        );
      }

      const confirmLink = `${siteUrl}/.netlify/functions/newsletter-confirm?token=${confirmToken}`;
      const emailResult = await sendEmail({
        to: email,
        subject: 'Confirma tu suscripción a VidigozTV',
        html: confirmEmailHtml({ nombre, confirmLink, siteUrl }),
      });
      if (!emailResult.ok) {
        console.error('[newsletter] error enviando confirmación:', emailResult.error);
      }

      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadySubscribed: false }) };
    }

    // Suscriptor nuevo
    const confirmToken = crypto.randomUUID();
    const unsubscribeToken = crypto.randomUUID();

    await db.query(
      `INSERT INTO subscribers (email, nombre, status, origen, confirm_token, unsubscribe_token)
       VALUES ($1, $2, 'pending', $3, $4, $5)`,
      [email, nombre || null, origen, confirmToken, unsubscribeToken]
    );

    const confirmLink = `${siteUrl}/.netlify/functions/newsletter-confirm?token=${confirmToken}`;
    const emailResult = await sendEmail({
      to: email,
      subject: 'Confirma tu suscripción a VidigozTV',
      html: confirmEmailHtml({ nombre, confirmLink, siteUrl }),
    });
    if (!emailResult.ok) {
      console.error('[newsletter] error enviando confirmación:', emailResult.error);
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadySubscribed: false }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
