const { Client } = require('@notionhq/client');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ORIGENES = ['historias.html', 'index.html', 'otro'];

function getNotionConfig() {
  let dbId = process.env.newsletter_db_id || '';
  let token = process.env.integration_token || '';

  if (!dbId || !token) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      if (!dbId) {
        const m = envContent.match(/^newsletter_db_id\s*=\s*(.+)$/m);
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

  const { dbId, token } = getNotionConfig();
  if (!dbId || !token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Faltan credenciales de Notion en el servidor' }) };
  }

  const notion = new Client({ auth: token });
  const database_id = formatDbId(dbId);

  try {
    const existing = await notion.databases.query({
      database_id,
      filter: { property: 'Email', title: { equals: email } },
      page_size: 1,
    });

    if (existing.results.length > 0) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadySubscribed: true }) };
    }

    await notion.pages.create({
      parent: { database_id },
      properties: {
        Email:  { title: [{ text: { content: email } }] },
        Nombre: nombre ? { rich_text: [{ text: { content: nombre } }] } : { rich_text: [] },
        Origen: { select: { name: origen } },
      },
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, alreadySubscribed: false }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
