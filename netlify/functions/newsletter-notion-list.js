// GET /.netlify/functions/newsletter-notion-list
// Lista páginas de Notion (Estado = Programado, las candidatas a newsletter) con su estado
// de envío en Postgres (sends), para la pantalla "Historias" del dashboard.
const { getPool } = require('./_shared/db');
const { listHistorias } = require('./_shared/notion-historias');
const { isTallerAuthorized, unauthorizedResponse } = require('./_shared/taller-auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!isTallerAuthorized(event)) return unauthorizedResponse();

  try {
    const historias = await listHistorias({ allStatuses: false });
    const db = getPool();

    const ids = historias.map((h) => h.id);
    let sendsByPage = {};
    if (ids.length > 0) {
      const r = await db.query(
        `SELECT notion_page_id, id, sent, sent_at, scheduled_at, recipients_count
         FROM sends WHERE notion_page_id = ANY($1::text[]) ORDER BY created_at DESC`,
        [ids]
      );
      for (const row of r.rows) {
        if (!sendsByPage[row.notion_page_id]) sendsByPage[row.notion_page_id] = row;
      }
    }

    const items = historias.map((h) => ({
      id: h.id,
      titulo: h.titulo,
      estado: h.estado,
      fechaPublicacion: h.fechaPublicacion,
      lastEditedTime: h.lastEditedTime,
      send: sendsByPage[h.id] || null,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ historias: items }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
