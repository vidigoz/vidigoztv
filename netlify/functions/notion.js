const { Client } = require('@notionhq/client');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const action = event.path.split('/').pop(); // 'create' | 'databases' | 'schema'

  // ── Obtener esquema (campos) de una base de datos ──────────────────────────
  if (action === 'schema') {
    const { notionToken, databaseId } = body;
    if (!notionToken || !databaseId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan notionToken o databaseId' }) };
    }
    try {
      const notion = new Client({ auth: notionToken });
      const rawId = databaseId.replace(/-/g, '');
      const formattedId = rawId.length === 32
        ? `${rawId.slice(0,8)}-${rawId.slice(8,12)}-${rawId.slice(12,16)}-${rawId.slice(16,20)}-${rawId.slice(20)}`
        : databaseId;

      const db = await notion.databases.retrieve({ database_id: formattedId });
      const fields = Object.entries(db.properties).map(([name, prop]) => {
        const f = { name, type: prop.type };
        if (prop.type === 'select')       f.options = prop.select.options.map(o => o.name);
        if (prop.type === 'multi_select') f.options = prop.multi_select.options.map(o => o.name);
        if (prop.type === 'status')       f.options = prop.status.options.map(o => o.name);
        return f;
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbTitle: db.title?.[0]?.plain_text || '', fields }),
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

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
    const { notionToken, databaseId, content, apiKey, model, fieldConfig } = body;
    if (!notionToken || !databaseId || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos requeridos' }) };
    }

    // fieldConfig: { "<nombre campo>": { mode: 'extract' | 'value', value?: <manual> } }
    const cfg = fieldConfig && typeof fieldConfig === 'object' ? fieldConfig : {};

    try {
      const notion = new Client({ auth: notionToken });

      // Formatear ID de base de datos
      const rawId = databaseId.replace(/-/g, '');
      const formattedId = rawId.length === 32
        ? `${rawId.slice(0,8)}-${rawId.slice(8,12)}-${rawId.slice(12,16)}-${rawId.slice(16,20)}-${rawId.slice(20)}`
        : databaseId;

      // Obtener esquema de la DB
      const db    = await notion.databases.retrieve({ database_id: formattedId });
      const props = db.properties;

      // Un campo cuyo nombre sea "Historia/Contenido/Story" recibe el texto crudo, no una extracción
      const isStoryField = (name) => /^(historia|contenido|story|content)$/i.test(name.trim());

      // ¿Qué campos de texto/número hay que EXTRAER con Claude?
      // Se extraen solo los campos activados en modo 'extract' que existan en la DB (excepto el de la historia cruda).
      const extractable = Object.entries(cfg)
        .filter(([name, c]) => c && c.mode === 'extract' && props[name] &&
          !isStoryField(name) &&
          ['title', 'rich_text', 'number'].includes(props[name].type))
        .map(([name]) => name);

      // Extraer campos con Claude si hay apiKey y algo que extraer
      let extracted = {};
      if (apiKey && extractable.length) {
        const claudeModel = model || 'claude-sonnet-5';
        const fieldList = extractable.map(n => `  "${n}": "valor para el campo '${n}'${n.toLowerCase().includes('año') || props[n].type === 'number' ? ' (solo el número)' : ''}${/prompt/i.test(n) ? ' — prompt detallado en inglés para Midjourney, estilo fotorrealista o pictórico histórico' : ''}"`).join(',\n');
        const extractResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: claudeModel,
            system: 'Eres un asistente que extrae información estructurada de historias. Responde SOLO con JSON válido, sin texto extra ni backticks. Usa exactamente las claves indicadas.',
            messages: [{
              role: 'user',
              content: `Analiza esta historia y extrae la siguiente información en JSON con estas claves exactas:
{
${fieldList}
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

      // Armar propiedades según la configuración de campos
      const pageProps = {};

      for (const [name, c] of Object.entries(cfg)) {
        if (!c || !props[name]) continue;              // campo desactivado o inexistente
        const type = props[name].type;

        // Valor manual/fijo (select, status, date, o texto fijo)
        const manual = c.mode === 'value' ? c.value : undefined;
        // Valor extraído por Claude, o el texto crudo si es el campo de la historia
        const auto = c.mode === 'extract'
          ? (isStoryField(name) ? content : extracted[name])
          : undefined;
        const val = manual !== undefined && manual !== '' ? manual : auto;

        if (val === undefined || val === null || val === '') continue;

        switch (type) {
          case 'title':
            pageProps[name] = { title: [{ text: { content: String(val).slice(0, 2000) } }] };
            break;
          case 'rich_text':
            pageProps[name] = { rich_text: [{ text: { content: String(val).slice(0, 2000) } }] };
            break;
          case 'number': {
            const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
            if (!isNaN(n)) pageProps[name] = { number: n };
            break;
          }
          case 'select':
            pageProps[name] = { select: { name: String(val) } };
            break;
          case 'status':
            pageProps[name] = { status: { name: String(val) } };
            break;
          case 'multi_select':
            pageProps[name] = { multi_select: (Array.isArray(val) ? val : [val]).map(v => ({ name: String(v) })) };
            break;
          case 'date':
            pageProps[name] = { date: { start: String(val) } };
            break;
          // 'files' y otros tipos no soportados: se omiten
        }
      }

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
