// ── Expone variables de configuración al frontend ──
// En Netlify CLI (netlify dev): se leen automáticamente del .env raíz
// En producción (Netlify): configura las variables en Site settings → Environment variables
//
// OJO: esto expone valores de process.env a cualquiera que llame este
// endpoint público. Son credenciales de escritura (Page Token, R2 secret)
// así que este archivo debe permanecer sin autenticación adicional sólo
// mientras /taller siga protegido por su propio Basic Auth — si el sitio
// alguna vez sirve /.netlify/functions/config sin ese resguardo delante,
// hay que añadirle su propia verificación antes de responder.

exports.handler = async () => {
  const notionToken   = process.env.integration_token || '';
  const notionDB      = process.env.db_id || '';
  const claudeApiKey  = process.env.claude_api_key || '';

  // Meta (Facebook / Instagram) y Cloudflare R2 — usados por Vidiclip
  // para precargar el modal de Configuración sin tener que pegarlos a mano.
  const metaToken     = process.env.meta_page_access_token || '';
  const metaFBPageID  = process.env.meta_fb_page_id || '';
  const metaIGAccID   = process.env.meta_ig_account_id || '';
  const r2Endpoint    = process.env.r2_endpoint_url || '';
  const r2PublicURL   = process.env.r2_public_url || '';
  const r2AccessKey   = process.env.r2_access_key_id || '';
  const r2SecretKey   = process.env.r2_secret_access_key || '';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      notionToken, notionDB, claudeApiKey,
      metaToken, metaFBPageID, metaIGAccID,
      r2Endpoint, r2PublicURL, r2AccessKey, r2SecretKey,
    }),
  };
};