// ── Expone db_id, integration_token y claude_api_key al frontend ──
// En Netlify CLI (netlify dev): se leen automáticamente del .env raíz
// En producción (Netlify): configura las variables en Site settings → Environment variables

exports.handler = async () => {
  const notionToken   = process.env.integration_token || '';
  const notionDB      = process.env.db_id || '';
  const claudeApiKey  = process.env.claude_api_key || '';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({ notionToken, notionDB, claudeApiKey }),
  };
};