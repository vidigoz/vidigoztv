// POST /.netlify/functions/newsletter-send
// Invocable manualmente desde el dashboard de /taller/newsletter, y reutilizado por el cron.
// Body: { notionPageId?: string, sendId?: string, resendMode?: 'onlyNew'|'all' }
//   - Si se pasa notionPageId: crea (o reanuda) un envío para esa historia. Si esa historia ya
//     se envió antes, esto es un REENVÍO — crea un send nuevo e independiente, y resendMode
//     decide a quién le llega ('onlyNew': solo quien nunca la recibió; 'all': a todos de nuevo).
//   - Si no se pasa nada: busca la próxima historia con Estado = Programado en Notion que
//     no tenga ya un `sends` completado.
const { getPool } = require('./_shared/db');
const { listHistorias } = require('./_shared/notion-historias');
const { sendNewsletterForPage } = require('./_shared/send-logic');
const { getSiteUrl } = require('./_shared/site-url');
const { isTallerAuthorized, unauthorizedResponse } = require('./_shared/taller-auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!isTallerAuthorized(event)) return unauthorizedResponse();

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const siteUrl = getSiteUrl(event);

  try {
    let notionPageId = body.notionPageId;
    const sendId = body.sendId;

    if (!notionPageId && !sendId) {
      // Buscar la próxima historia "Programado" sin envío completado.
      const db = getPool();
      const historias = await listHistorias({ allStatuses: false });
      let candidate = null;
      for (const h of historias) {
        const existing = await db.query('SELECT id FROM sends WHERE notion_page_id = $1 AND sent = true LIMIT 1', [h.id]);
        if (existing.rowCount === 0) { candidate = h; break; }
      }
      if (!candidate) {
        return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No hay historias pendientes de enviar (Estado = Programado sin envío previo)' }) };
      }
      notionPageId = candidate.id;
    }

    if (sendId && !notionPageId) {
      const db = getPool();
      const r = await db.query('SELECT notion_page_id FROM sends WHERE id = $1', [sendId]);
      if (r.rowCount === 0) return { statusCode: 404, body: JSON.stringify({ error: 'sendId no encontrado' }) };
      notionPageId = r.rows[0].notion_page_id;
    }

    const resendMode = body.resendMode === 'all' ? 'all' : 'onlyNew';
    const result = await sendNewsletterForPage({ notionPageId, sendId, siteUrl, resendMode });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
