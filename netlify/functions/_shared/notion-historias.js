// Helpers compartidos para leer la base de historias de Notion (db_id / integration_token),
// reutilizados por newsletter-notion-list.js, newsletter-preview.js y _send-logic.js.
//
// Decisión de adaptación (no cubierta explícitamente por el kanban): la base de Notion de
// historias (`vidiclip_db`) tiene el campo `Estado` (tipo status) con las opciones fijas
// Revision / Listo / Programado / Cancelado / Previo — la API de Notion no permite agregar
// opciones nuevas a un campo status, así que no se puede crear un valor "Listo para enviar"
// sin editar el schema a mano en la UI de Notion. En su lugar: se usa `Estado = Programado`
// (mismo criterio que ya usa historias.js/server.js para publicar en el sitio) como la lista
// de candidatas para newsletter, y el control de "ya se envió" vive en Postgres
// (sends.notion_page_id + sent=true), no en Notion. No se reescribe `Estado` tras enviar.
const { Client } = require('@notionhq/client');

function getNotionConfig() {
  let dbId = process.env.db_id || '';
  let token = process.env.integration_token || '';

  if (!dbId || !token) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      if (!dbId) {
        const m = envContent.match(/^db_id\s*=\s*(.+)$/m);
        if (m) dbId = m[1].trim();
      }
      if (!token) {
        const m = envContent.match(/^integration_token\s*=\s*(.+)$/m);
        if (m) token = m[1].trim();
      }
    } catch {
      // sin .env disponible — se queda con env vars
    }
  }

  return { dbId, token };
}

function formatDbId(raw) {
  const id = raw.replace(/-/g, '');
  return id.length === 32
    ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
    : raw;
}

function getTitle(prop) { return prop?.title?.map((t) => t.plain_text).join('') || ''; }
function getRichText(prop) { return prop?.rich_text?.map((t) => t.plain_text).join('') || ''; }
function getFileUrl(prop) {
  const files = prop?.files;
  if (!files || files.length === 0) return null;
  const f = files[0];
  return f.type === 'external' ? f.external?.url : f.file?.url || null;
}

function parsePage(page) {
  const p = page.properties;
  return {
    id: page.id,
    titulo: getTitle(p['Titulo']),
    historia: getRichText(p['Historia']),
    oficio: getRichText(p['Oficio']),
    lugar: getRichText(p['Lugar']),
    detalles: getRichText(p['Detalles']),
    sopa: getRichText(p['Sopa']),
    anio: p['Año']?.number ?? null,
    categoria: p['Category']?.select?.name || '',
    imagenUrl: getFileUrl(p['Imagen']) || getFileUrl(p['Imagen 1:1']),
    estado: p['Estado']?.status?.name || '',
    fechaPublicacion: p['Fecha de Publicacion']?.date?.start || null,
    lastEditedTime: page.last_edited_time,
  };
}

/**
 * Lista historias de Notion. Por default filtra Estado = Programado (candidatas a newsletter),
 * o sin filtro si allStatuses = true.
 */
async function listHistorias({ allStatuses = false } = {}) {
  const { dbId, token } = getNotionConfig();
  if (!dbId || !token) throw new Error('Faltan credenciales de Notion en el servidor (db_id / integration_token)');

  const notion = new Client({ auth: token });
  const results = [];
  let cursor;
  do {
    const resp = await notion.databases.query({
      database_id: formatDbId(dbId),
      ...(allStatuses ? {} : { filter: { property: 'Estado', status: { equals: 'Programado' } } }),
      sorts: [{ property: 'Fecha de Publicacion', direction: 'descending' }],
      start_cursor: cursor,
    });
    results.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  return results.map(parsePage);
}

/** Trae una historia por su Notion page id. */
async function getHistoriaById(pageId) {
  const { token } = getNotionConfig();
  if (!token) throw new Error('Falta integration_token en el servidor');
  const notion = new Client({ auth: token });
  const page = await notion.pages.retrieve({ page_id: pageId });
  return parsePage(page);
}

module.exports = { listHistorias, getHistoriaById, getNotionConfig, formatDbId, parsePage };
