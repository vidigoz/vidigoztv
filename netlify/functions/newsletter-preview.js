// GET /.netlify/functions/newsletter-preview?pageId=XXX
// Trae el contenido de una historia de Notion y lo devuelve como el HTML final del correo
// (con un link de baja de ejemplo, ya que no hay un destinatario real en la vista previa).
const { getHistoriaById } = require('./_shared/notion-historias');
const { renderEmail } = require('./_shared/email-template');
const { getSiteUrl } = require('./_shared/site-url');
const { isTallerAuthorized, unauthorizedResponse } = require('./_shared/taller-auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!isTallerAuthorized(event)) return unauthorizedResponse();

  const qs = event.queryStringParameters || {};
  const pageId = qs.pageId;
  if (!pageId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta pageId' }) };
  }

  try {
    const historia = await getHistoriaById(pageId);
    const siteUrl = getSiteUrl(event);
    const html = renderEmail({
      titulo: historia.titulo,
      cuerpo: historia.historia,
      imagenUrl: historia.imagenUrl,
      unsubscribeLink: `${siteUrl}/.netlify/functions/newsletter-unsubscribe?token=EJEMPLO`,
      siteUrl,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      body: html,
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
