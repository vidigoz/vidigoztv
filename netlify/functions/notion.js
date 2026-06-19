const { Client } = require('@notionhq/client');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const action = event.path.split('/').pop(); // 'create' | 'databases'

  // ── Listar bases de datos ──────────────────────────────────────────────────
  if (action === 'databases') {
    const { notionToken } = body;
    if (!notionToken) return { statusCode: 400, body: JSON.stringify({ error: 'Falta notionToken' }) };
    try {
      const notion = new Client({ auth: notionToken });
      const resp = await notion.search({ filter: { value: 'database', property: 'object' } });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resp.results.map(db => ({
          id: db.id,
          title: db.title?.[0]?.plain_text || 'Sin título',
        }))),
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── Crear página en Notion ─────────────────────────────────────────────────
  if (action === 'create') {
    const { notionToken, databaseId, content, apiKey, model } = body;
    if (!notionToken || !databaseId || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos requeridos' }) };
    }

    try {
      const notion = new Client({ auth: notionToken });

      // Formatear ID de base de datos
      const rawId = databaseId.replace(/-/g, '');
      const formattedId = rawId.length === 32
        ? `${rawId.slice(0,8)}-${rawId.slice(8,12)}-${rawId.slice(12,16)}-${rawId.slice(16,20)}-${rawId.slice(20)}`
        : databaseId;

      // Extraer campos con Claude si hay apiKey
      let extracted = {};
      if (apiKey) {
        const claudeModel = model || 'claude-sonnet-4-6';
        const extractResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: claudeModel,
            system: 'Eres un asistente que extrae información estructurada de historias. Responde SOLO con JSON válido, sin texto extra ni backticks.',
            messages: [{
              role: 'user',
              content: `Analiza esta historia y extrae la siguiente información en JSON:
{
  "titulo": "título corto y atractivo para la historia",
  "oficio": "oficio o profesión del personaje principal",
  "anio": "año donde se desarrolla la historia (solo el número)",
  "lugar": "lugar donde se desarrolla la historia",
  "sopa": "la sopa que se menciona en la historia",
  "prompt_imagen": "prompt detallado en inglés para Midjourney que capture la escena principal de la historia, estilo fotorrealista o pictórico histórico"
}

Historia:
${content}`,
            }],
            max_tokens: 1024,
          }),
        });
        const claudeData = await extractResp.json();
        const raw = claudeData.content?.[0]?.text || '{}';
        try { extracted = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch {}
      }

      // Obtener esquema de la DB
      const db   = await notion.databases.retrieve({ database_id: formattedId });
      const props = db.properties;

      const findProp = (names, type) => {
        for (const name of names) {
          const entry = Object.entries(props).find(([k, v]) =>
            v.type === type && k.toLowerCase() === name.toLowerCase()
          );
          if (entry) return entry;
        }
        for (const name of names) {
          const entry = Object.entries(props).find(([k, v]) =>
            v.type === type && k.toLowerCase().includes(name.toLowerCase())
          );
          if (entry) return entry;
        }
        return null;
      };

      const pageProps = {};

      const titleProp = Object.entries(props).find(([, v]) => v.type === 'title');
      if (titleProp && extracted.titulo)
        pageProps[titleProp[0]] = { title: [{ text: { content: extracted.titulo } }] };

      const historiaProp = findProp(['historia', 'story', 'contenido', 'content'], 'rich_text');
      if (historiaProp)
        pageProps[historiaProp[0]] = { rich_text: [{ text: { content: content.slice(0, 2000) } }] };

      const promptProp = findProp(['prompt de imagen', 'prompt imagen', 'imagen prompt', 'image prompt', 'prompt'], 'rich_text');
      if (promptProp && extracted.prompt_imagen)
        pageProps[promptProp[0]] = { rich_text: [{ text: { content: extracted.prompt_imagen } }] };

      const estadoProp = findProp(['estado', 'status'], 'select');
      if (estadoProp)
        pageProps[estadoProp[0]] = { select: { name: 'Revisión' } };

      const oficioRich = findProp(['oficio', 'profesión', 'ocupacion'], 'rich_text');
      const oficioSel  = findProp(['oficio', 'profesión', 'ocupacion'], 'select');
      if (oficioRich && extracted.oficio)
        pageProps[oficioRich[0]] = { rich_text: [{ text: { content: extracted.oficio } }] };
      else if (oficioSel && extracted.oficio)
        pageProps[oficioSel[0]] = { select: { name: extracted.oficio } };

      const anioNum  = findProp(['año', 'anio', 'year'], 'number');
      const anioRich = findProp(['año', 'anio', 'year'], 'rich_text');
      if (anioNum && extracted.anio) {
        const n = parseInt(extracted.anio);
        if (!isNaN(n)) pageProps[anioNum[0]] = { number: n };
      } else if (anioRich && extracted.anio) {
        pageProps[anioRich[0]] = { rich_text: [{ text: { content: String(extracted.anio) } }] };
      }

      const lugarRich = findProp(['lugar', 'location', 'locación', 'place'], 'rich_text');
      const lugarSel  = findProp(['lugar', 'location', 'locación', 'place'], 'select');
      if (lugarRich && extracted.lugar)
        pageProps[lugarRich[0]] = { rich_text: [{ text: { content: extracted.lugar } }] };
      else if (lugarSel && extracted.lugar)
        pageProps[lugarSel[0]] = { select: { name: extracted.lugar } };

      const sopaRich = findProp(['sopa', 'soup'], 'rich_text');
      const sopaSel  = findProp(['sopa', 'soup'], 'select');
      if (sopaRich && extracted.sopa)
        pageProps[sopaRich[0]] = { rich_text: [{ text: { content: extracted.sopa } }] };
      else if (sopaSel && extracted.sopa)
        pageProps[sopaSel[0]] = { select: { name: extracted.sopa } };

      const children = [];
      for (let i = 0; i < content.length; i += 2000) {
        children.push({
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: content.slice(i, i + 2000) } }] },
        });
      }

      const page = await notion.pages.create({
        parent: { database_id: formattedId },
        properties: pageProps,
        children: children.slice(0, 100),
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, pageId: page.id, url: page.url, extracted }),
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 404, body: 'Not found' };
};
