const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Anthropic proxy ──────────────────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  const { apiKey, model, system, messages, max_tokens } = req.body;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model, system, messages, max_tokens: max_tokens || 1024 })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notion proxy ─────────────────────────────────────────────────────────────
app.post('/api/notion/create', async (req, res) => {
  const { notionToken, databaseId, content, apiKey, model } = req.body;
  try {
    const notion = new Client({ auth: notionToken });

    // Format database ID with dashes if needed
    const rawId = databaseId.replace(/-/g, '');
    const formattedId = rawId.length === 32
      ? `${rawId.slice(0,8)}-${rawId.slice(8,12)}-${rawId.slice(12,16)}-${rawId.slice(16,20)}-${rawId.slice(20)}`
      : databaseId;

    // Use Claude to extract fields from the story
    const claudeModel = model || 'claude-sonnet-4-20250514';
    const extractResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
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
${content}`
        }],
        max_tokens: 1024
      })
    });

    const claudeData = await extractResp.json();
    const raw = claudeData.content?.[0]?.text || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    let extracted = {};
    try { extracted = JSON.parse(clean); } catch(e) {}

    // Fetch DB schema
    const db = await notion.databases.retrieve({ database_id: formattedId });
    const props = db.properties;

    const pageProps = {};

    // Helper to find property by name (case-insensitive exact match, then partial)
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

    // Título (title type)
    const titleProp = Object.entries(props).find(([, v]) => v.type === 'title');
    if (titleProp && extracted.titulo) {
      pageProps[titleProp[0]] = { title: [{ text: { content: extracted.titulo } }] };
    }

    // Historia (rich_text)
    const historiaProp = findProp(['historia', 'story', 'contenido', 'content'], 'rich_text');
    if (historiaProp) {
      pageProps[historiaProp[0]] = { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
    }

    // Prompt de imagen (rich_text)
    const promptProp = findProp(['prompt de imagen', 'prompt imagen', 'imagen prompt', 'image prompt', 'prompt'], 'rich_text');
    if (promptProp && extracted.prompt_imagen) {
      pageProps[promptProp[0]] = { rich_text: [{ text: { content: extracted.prompt_imagen } }] };
    }

    // Estado (select)
    const estadoProp = findProp(['estado', 'status'], 'select');
    if (estadoProp) {
      pageProps[estadoProp[0]] = { select: { name: 'Revisión' } };
    }

    // Oficio (rich_text o select)
    const oficioPropRich = findProp(['oficio', 'profesión', 'ocupacion', 'ocupación'], 'rich_text');
    const oficioPropSelect = findProp(['oficio', 'profesión', 'ocupacion', 'ocupación'], 'select');
    if (oficioPropRich && extracted.oficio) {
      pageProps[oficioPropRich[0]] = { rich_text: [{ text: { content: extracted.oficio } }] };
    } else if (oficioPropSelect && extracted.oficio) {
      pageProps[oficioPropSelect[0]] = { select: { name: extracted.oficio } };
    }

    // Año (number o rich_text)
    const anioNum = findProp(['año', 'anio', 'year'], 'number');
    const anioRich = findProp(['año', 'anio', 'year'], 'rich_text');
    if (anioNum && extracted.anio) {
      const n = parseInt(extracted.anio);
      if (!isNaN(n)) pageProps[anioNum[0]] = { number: n };
    } else if (anioRich && extracted.anio) {
      pageProps[anioRich[0]] = { rich_text: [{ text: { content: String(extracted.anio) } }] };
    }

    // Lugar (rich_text o select)
    const lugarRich = findProp(['lugar', 'location', 'locación', 'place'], 'rich_text');
    const lugarSelect = findProp(['lugar', 'location', 'locación', 'place'], 'select');
    if (lugarRich && extracted.lugar) {
      pageProps[lugarRich[0]] = { rich_text: [{ text: { content: extracted.lugar } }] };
    } else if (lugarSelect && extracted.lugar) {
      pageProps[lugarSelect[0]] = { select: { name: extracted.lugar } };
    }

    // Sopa (rich_text o select)
    const sopaRich = findProp(['sopa', 'soup'], 'rich_text');
    const sopaSelect = findProp(['sopa', 'soup'], 'select');
    if (sopaRich && extracted.sopa) {
      pageProps[sopaRich[0]] = { rich_text: [{ text: { content: extracted.sopa } }] };
    } else if (sopaSelect && extracted.sopa) {
      pageProps[sopaSelect[0]] = { select: { name: extracted.sopa } };
    }

    // Build children blocks for full story
    const children = [];
    for (let i = 0; i < content.length; i += 2000) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: content.slice(i, i + 2000) } }] }
      });
    }

    const page = await notion.pages.create({
      parent: { database_id: formattedId },
      properties: pageProps,
      children: children.slice(0, 100)
    });

    res.json({ success: true, pageId: page.id, url: page.url, extracted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notion DB list (for settings picker) ─────────────────────────────────────
app.post('/api/notion/databases', async (req, res) => {
  const { notionToken } = req.body;
  try {
    const notion = new Client({ auth: notionToken });
    const resp = await notion.search({ filter: { value: 'database', property: 'object' } });
    res.json(resp.results.map(db => ({ id: db.id, title: db.title?.[0]?.plain_text || 'Sin título' })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3900;
app.listen(PORT, () => console.log(`\n🖊  StoryForge corriendo en http://localhost:${PORT}\n`));
