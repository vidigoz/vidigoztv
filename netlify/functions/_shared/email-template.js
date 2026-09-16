// Plantilla HTML de correo del newsletter — misma estética que el sitio
// (fondo #050410, tarjeta #16142a, acento #e2632f, texto #f2efe9,
// Space Grotesk para headings + Manrope para body).
// Usa tablas HTML para compatibilidad con Gmail/Outlook/Apple Mail.
//
// Extendida (diseñada en Claude Design, /design) con 3 secciones nuevas después de la
// historia: Redes sociales, Juegos, Merch/Tienda — cada una su propia tarjeta compacta con
// un mini-título naranja, antes del footer con el link de baja obligatorio.
// Los 3 íconos de redes son archivos PNG reales en site/icons/ (mismos SVG que usa el
// landing page), servidos por URL normal — más confiable que data: URI, que Outlook y
// varios webmail bloquean o no renderizan bien inline en el cuerpo del correo.

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
         <img src="${escapeHtml(imagenUrl)}" alt="${safeTitulo}" width="100%" style="display:block;width:100%;max-width:548px;border-radius:12px;">
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

        <!-- Historia -->
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

        <!-- Espaciador -->
        <tr><td style="padding:8px 0;">&nbsp;</td></tr>

        <!-- Redes sociales -->
        <tr>
          <td style="background-color:#16142a;border-radius:18px;padding:24px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 0 4px;">
                  <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e2632f;">Síguenos</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0 0;">
                  <p style="margin:0 0 16px;color:rgba(242,239,233,.65);font-family:'Manrope',Arial,sans-serif;font-size:13.5px;line-height:1.6;">Historias medievales nuevas cada semana en tus redes favoritas.</p>
                </td>
              </tr>
              <tr>
                <td>
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-right:10px;">
                        <a href="https://www.facebook.com/vidigoztv"><img src="${site}/icons/newsletter-social-fb.png" width="40" height="40" alt="Facebook" style="display:block;border-radius:10px;"></a>
                      </td>
                      <td style="padding-right:10px;">
                        <a href="https://www.instagram.com/vidigoztv/"><img src="${site}/icons/newsletter-social-ig.png" width="40" height="40" alt="Instagram" style="display:block;border-radius:10px;"></a>
                      </td>
                      <td>
                        <a href="https://www.tiktok.com/@vidigoztv"><img src="${site}/icons/newsletter-social-tt.png" width="40" height="40" alt="TikTok" style="display:block;border-radius:10px;"></a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Espaciador -->
        <tr><td style="padding:8px 0;">&nbsp;</td></tr>

        <!-- Juegos -->
        <tr>
          <td style="background-color:#16142a;border-radius:18px;padding:24px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 0 4px;">
                  <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e2632f;">Para jugar</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0 16px;">
                  <p style="margin:0;color:rgba(242,239,233,.65);font-family:'Manrope',Arial,sans-serif;font-size:13.5px;line-height:1.6;">Dos juegos gratis del canal, directo en tu navegador.</p>
                </td>
              </tr>
              <tr>
                <td>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="48%" valign="top" style="background-color:#0c0a1c;border-radius:12px;padding:16px;">
                        <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:600;font-size:14px;color:#f2efe9;">El Sacamuelas</span><br>
                        <a href="https://sacamuelas.netlify.app/" style="display:inline-block;margin-top:10px;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:12.5px;color:#e2632f;">Jugar →</a>
                      </td>
                      <td width="4%">&nbsp;</td>
                      <td width="48%" valign="top" style="background-color:#0c0a1c;border-radius:12px;padding:16px;">
                        <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:600;font-size:14px;color:#f2efe9;">Cerdo Icario</span><br>
                        <a href="https://cerdoicario.netlify.app/" style="display:inline-block;margin-top:10px;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:12.5px;color:#e2632f;">Jugar →</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Espaciador -->
        <tr><td style="padding:8px 0;">&nbsp;</td></tr>

        <!-- Merch / Tienda -->
        <tr>
          <td style="background-color:#16142a;border-radius:18px;padding:24px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 0 4px;">
                  <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#e2632f;">De la tienda</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0 18px;">
                  <p style="margin:0;color:rgba(242,239,233,.65);font-family:'Manrope',Arial,sans-serif;font-size:13.5px;line-height:1.6;">Lleva el Tempoverso contigo — playeras, tazas y más del canal.</p>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="https://vidigoztv.printify.me/" style="display:inline-block;background-color:#e2632f;color:#050410;font-family:'Manrope',Arial,sans-serif;font-weight:700;font-size:13.5px;text-decoration:none;padding:11px 22px;border-radius:10px;">Ver la tienda →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 10px 0;text-align:center;">
            <span style="font-family:'Space Grotesk',Arial,sans-serif;font-weight:700;font-size:13px;letter-spacing:.1em;color:rgba(242,239,233,.5);">VIDIGOZTV</span>
            <p style="margin:10px 0;font-family:'Manrope',Arial,sans-serif;font-size:12.5px;color:rgba(242,239,233,.45);">
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
