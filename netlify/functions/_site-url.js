// Deriva la URL base del sitio desde el propio request cuando es posible
// (funciona igual en producción, deploy previews y localhost), con fallback
// a un dominio fijo si no hay headers útiles.
function getSiteUrl(event) {
  const headers = (event && event.headers) || {};
  const host = headers['x-forwarded-host'] || headers['host'];
  const proto = headers['x-forwarded-proto'] || (host && host.includes('localhost') ? 'http' : 'https');
  if (host) return `${proto}://${host}`;
  return process.env.SITE_URL || 'https://vidigoztv.com';
}

module.exports = { getSiteUrl };
