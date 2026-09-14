// Plantilla HTML de correo del newsletter — misma estética que el sitio
// (fondo #050410, tarjeta #16142a, acento #e2632f, texto #f2efe9,
// Space Grotesk para headings + Manrope para body).
// Usa tablas HTML para compatibilidad con Gmail/Outlook/Apple Mail.

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Convierte texto plano (párrafos separados por líneas en blanco) en <p> HTML.
function textToParagraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;color:#f2efe9;font-family:'Manrope',Arial,sans-serif;font-size:15px;line-height:1.7;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * Renderiza el HTML completo de un correo de newsletter.
 * @param {Object} opts
 * @param {string} opts.titulo - Título de la historia
 * @param {string} opts.cuerpo - Cuerpo (texto plano; se formatea a párrafos)
 * @param {string} [opts.imagenUrl] - URL de imagen destacada (opcional)
 * @param {string} opts.unsubscribeLink - Link único de baja para este destinatario
 * @param {string} [opts.siteUrl] - URL base del sitio (default vidigoztv.com)
 */
function renderEmail({ titulo, cuerpo, imagenUrl, unsubscribeLink, siteUrl }) {
  const site = siteUrl || 'https://vidigoztv.com';
  const safeTitulo = escapeHtml(titulo || 'Nueva historia de VidigozTV');
  const bodyHtml = textToParagraphs(cuerpo);
  const imageBlock = imagenUrl
    ? `<tr><td style="padding:0 0 24px;">
         <img src="${escapeHtml(imagenUrl)}" alt="" width="100%" style="display:block;width:100%;max-width:600px;border-radius:12px;">
       </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitulo}</title>
</head>
<body style="margin:0;padding:0;background-color:#050410;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050410;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="padding:0 0 28px;text-align:center;">
            <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:.12em;color:#f2efe9;">VIDIGOZTV</span>
            <div style="width:40px;height:2px;background-color:#e2632f;margin:10px auto 0;border-radius:1px;"></div>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background-color:#16142a;border-radius:18px;padding:28px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 0 20px;">
                  <h1 style="margin:0;font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.3;color:#f2efe9;">${safeTitulo}</h1>
                </td>
              </tr>
              ${imageBlock}
              <tr>
                <td>
                  ${bodyHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 10px 0;text-align:center;">
            <p style="margin:0 0 10px;font-family:'Manrope',Arial,sans-serif;font-size:12.5px;color:rgba(242,239,233,.45);">
              Recibes este correo porque te suscribiste en <a href="${site}" style="color:#e2632f;text-decoration:none;">${site.replace(/^https?:\/\//, '')}</a>
            </p>
            <p style="margin:0;font-family:'Manrope',Arial,sans-serif;font-size:12.5px;">
              <a href="${escapeHtml(unsubscribeLink || '#')}" style="color:rgba(242,239,233,.45);text-decoration:underline;">Darme de baja</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

module.exports = { renderEmail, escapeHtml, textToParagraphs };
