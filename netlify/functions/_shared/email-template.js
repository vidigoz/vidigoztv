// Plantilla HTML de correo del newsletter — misma estética que el sitio
// (fondo #050410, tarjeta #16142a, acento #e2632f, texto #f2efe9,
// Space Grotesk para headings + Manrope para body).
// Usa tablas HTML para compatibilidad con Gmail/Outlook/Apple Mail.
//
// Extendida (diseñada en Claude Design, /design) con 3 secciones nuevas después de la
// historia: Redes sociales, Juegos, Merch/Tienda — cada una su propia tarjeta compacta con
// un mini-título naranja, antes del footer con el link de baja obligatorio.
// Los 3 íconos de redes van embebidos como data: URI (SVG→PNG, ~1-3KB cada uno) para no
// depender de ninguna URL externa — igual de confiable que un logo de marca en un email.

// Íconos de redes sociales embebidos (mismo trazo/acento naranja #e2632f que usa el sitio
// en taller/index.html). Generados una vez desde SVG, no cambian.
const FB_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAEgklEQVR4nOybXWgcVRTH/2cmMabGKqVWSdJdDShYsrsFi7YoGvBJrA/Fqg8asZsgCIpQ0II+mCcRQfxAFEo32Vofah/0SUVBjJ8US5HdplEftGQ3lUhLoTZRozv3eGbbh3Zmdtm5szO7Zeb3MuyZe2fmnjnn3HPvmTUQcwzEnB50IWeeHLlmeXXNejKM9TBVf7O2Zo2WBovHfoYmhC5hMZ/ZpmDsZOJHCXQ9/PED4b/7Nhbmz8AnHbeA6uTomGLzdQVstn+T3ju5XcF8Vo4vwScdU0D18dwQ9/K7zPRAO8yQmG6BBh1RQDWf2yFvvChvey3aBBOZ0CDyWWAhn51iwodEaNvgbYjB0CBSC1iYyI1TMz9lnJJRfARYXxiKfupbY53Y8M78srNZJZ/7QELFw2gDkSngfJTHew0bML/cj9VXrpv+5RwiJBIF8EMwq0QHvU/iJFRtR6p4/AhaRKzdcM4WrDl9RKKAytrsY/J8KadczP1sD1vbhorHq+gQkQRBCVBPecoVHhmamfM9eLJ7uu/RnUFwcTI7rJjucJ1gHErNlD7z6mOnwiu1gZ0yorvlZ9qjySa0idAVYDEe9HROy3rBSywK23rOooMyTabhg66NAWKaW12Pxiil9s/96my7kM+MWApfyuCvRESEHwQJg06RuOvn3k1pP4i0Bk/g09Ag9CDIjGG3EItO0dJ4doMM/i7o3kfRJ9AgfBcgGnHJgFNO2b+9tNnzAsxfoekNcJKY30/NHPsUGnRkMcQG11wyWNcS3OuZ1HR5DCES+y2xRAGIOcmuMAKyNJm9aVXRWxLZ75WI3N9KH1ORK2832VDKI5erTORayfHfThVKz0CDwBawynRAMrftrQ6+EZbBQbYGn67syr4IDQIrQJ76TvhEhuq2AA+r8HdNuhUadCQPIEM2QRwoxh8IgFjhCWgQeRCU1Pj74X3lw055qlj+RtYIR6EJk/U1NAjFAiQ1nYKh3CmsRSwpa8PUNl0ob6nuytwjEbFhPGA2x+WQd8p7jb7voEEoChB3nk/vm5uFBhubKMhmYSL7nHvpz4cH9x79CxpcVnkA1129vkt0CWJxs9CkK6vDjajmR2+T4Q445czGLDS5rBQg08eYW8jqihq+hSahKEBymk121fdimRRB1YC5Ulq397ezzfrWvw2wrsoRscs95Rr3uzowjtxwoLwCTUJRgCQlU2D32n7Zutouj72aLpT2ePWTktdryxZ216/RYlrEoFkEIPIgKEHs+eoTmYxTXsmPbpGTu+ETg/QDYL0/AsLM/8AvPcbNTpHBxo3QoK+vpu3/9fsiOD/CJ2S5/dsipfMs017VYz8EXwxZalz89WMtS7gIezncalu53592ZanH/HsPAhI4CF4ocGxvdN5rPe+19LUtwHNTtFAK9UOuZEsMMSdRAGJOogDEnEQBiDmJAhBzEgUg5iQKQMxJvg9AByAYh2SfAN1A4gKIOeF/KQrWr/szfkfIRGEBb0ITAr+BkInkn6NSJsvKYZ2fPlLwPJ0qlOcQMl3z19lOEfsg+D8AAAD//xoMmMwAAAAGSURBVAMAiU9i8LeDoxsAAAAASUVORK5CYII=';
const IG_ICON = 'data:image/png;base64,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';
const TT_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAEmUlEQVR4nOybbWhbVRjH/89NUitSabWsW9dmDJTi6JJV0U3FKROHOl/2wVGQiTWJIggK+skvUlAUwa++oEvbVRFFkFWrQucbIoqibllqrSJKXsSMgtU56jKa8/hc3T4sudnuvUnuPSH5QXtvnnPOvTn/nvuc5zzn1kCLY6DFaQuAFqctAFqctgBocYLwmUIisvGkwvNyup2JfiLm8fDEkXfgEb6PgCLTqyC6RX4uIGBEjjP5RGQAHuG7ANLpa8ttzBiGR/j+CFjCPAiP0FIAJvTBI/QcAaCr4BGaToN0+1JsqAseoG0csILOh+AB2gpAhMe8GAU6R4K9KzjvAD9wRQgNROtQmIh25FZXZ3PxTRehQei/FiDsZA6lM4nhm9AAmmMxROgnDsxlYtHZegtB8JlsPMpwCnNOfv/y3zlRgVjtH5xIfwAXaCmAGH6XL7YODiBSuwb3pd+HQ7R8BAKKHxYVnnTShpl2wQXa+oDwROoJGQVbpWdf2WtBAbhAayc4mEx9LcmRbVBqt4yIubPVZYVZuEDTxdCZhCfTM3KYydy9uYc6jVHp7pBkj3oJ3Cv2PySL9JrUceUEtRSgZLClc97wenpZDi+hjrSToqgzucTwDVDG9TJEwwxeS6C/nc7TAUXOYwOX1EWA5bEt3ccDalwx3Sv5vO7T0QWdOmEyRvPx4dsGkvPvQTNqfgSysc1jxwz+lUGPyBK2u1o9BeNWaIjrESBjlHKx6HPyR37UXjhpf56u5gQbgWsBJISdlm+51259J/O09j4gE488brPz30vXU7XM043GsQC/xaMjJeDp6jX4mWCJp/un0otoAhwLUGJ+0UzYWfCzLGJG108e+Q41oq0PyCaio+L9tlYUMJa6FF3ZM5X6E02GsxHAeLBKyd6eqcNN13kT23EA70GAmbdZlOyXpescmhTbIyB/4aaNEtl1ltsZxitoYmyPAIUOyw3LEIp5NDG2BSBV6rWy9yd/yKDOyCSg4BH2fUCAV6zssmlxCVySG7vsUiu7xIHL8AjbAkjFo1Z2UsEtcIkyAiNW9hJWC/AI2wIM/KUWZX1fLLcrA64FkKj/8nKLeY/whgXPokj7PuCthZNy+LzcLquWROGeyBo4xGwjOb1ExX2AT2gc+vmA/6GDFRZQX7GD3mYHmyxmTFEM4YCE1BdXFtKH8BBHAnRSaQrmuwtlmG96yfL4TTMzdK5rmHWyXZE3ZOf36opCxj8hNqbhIY4E6Ns3f1Q6+6xVmdj3HAuoxXw8cmO19rl45GazjnT+Lusa/NS6yUNL8BBXq65MLPKRuXdfrVxC5h/l8JlB/KnkCDskXXaNfN4ubYbOctmD4WRqJzzGVULk/M7VO0+cCH4pz7DlC42nOjokHb/flPicKjPPB4Oh3fABV0nRNS8sHO9SxnX29+2qIyPkC/Na/S9/uwIfqDnxkI1FJ+UqY3ADc1L2/hLwkZrT4rIUvs/cxZVp8LDtRszfmG387rxJXVNPZr5QMd8hCa0dMrQHxBesNT2i3KUgU1xePn8sir+7Ppk6BE3w/Q0Rv2n/ywxanLYAaHHaAqDFaXkB/gUAAP//b7DrjQAAAAZJREFUAwDFznAunym6KQAAAABJRU5ErkJggg==';

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
                        <a href="https://www.facebook.com/vidigoztv" style="display:inline-block;width:40px;height:40px;background-color:#0c0a1c;border-radius:10px;text-align:center;line-height:40px;">
                          <img src="${FB_ICON}" width="18" height="18" alt="Facebook" style="vertical-align:middle;">
                        </a>
                      </td>
                      <td style="padding-right:10px;">
                        <a href="https://www.instagram.com/vidigoztv/" style="display:inline-block;width:40px;height:40px;background-color:#0c0a1c;border-radius:10px;text-align:center;line-height:40px;">
                          <img src="${IG_ICON}" width="18" height="18" alt="Instagram" style="vertical-align:middle;">
                        </a>
                      </td>
                      <td>
                        <a href="https://www.tiktok.com/@vidigoztv" style="display:inline-block;width:40px;height:40px;background-color:#0c0a1c;border-radius:10px;text-align:center;line-height:40px;">
                          <img src="${TT_ICON}" width="18" height="18" alt="TikTok" style="vertical-align:middle;">
                        </a>
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
