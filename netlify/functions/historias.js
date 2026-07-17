const { Client } = require('@notionhq/client');

// Lee credenciales de Notion desde variables de entorno (Netlify) o desde .env (fallback local).
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
      // sin .env disponible (producción sin el archivo) — se queda con env vars
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

function getTitle(prop) {
  if (!prop) return '';
  return prop.title?.map(t => t.plain_text).join('') || '';
}

function getRichText(prop) {
  if (!prop) return '';
  return prop.rich_text?.map(t => t.plain_text).join('') || '';
}

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
    imagenUrl: getFileUrl(p['Imagen']),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { dbId, token } = getNotionConfig();
  if (!dbId || !token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Faltan credenciales de Notion en el servidor' }) };
  }

  const qs = event.queryStringParameters || {};
  const notion = new Client({ auth: token });

  try {
    const results = [];
    let cursor;
    do {
      const resp = await notion.databases.query({
        database_id: formatDbId(dbId),
        filter: { property: 'Estado', status: { equals: 'Programado' } },
        sorts: [{ property: 'Fecha de Publicacion', direction: 'descending' }],
        start_cursor: cursor,
      });
      results.push(...resp.results);
      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    const historias = results.map(parsePage);

    if (qs.random === 'true') {
      if (historias.length === 0) {
        return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No hay historias programadas' }) };
      }
      const pick = historias[Math.floor(Math.random() * historias.length)];
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pick) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ historias }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
