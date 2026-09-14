// Pool de Postgres compartido (vidigoztv_db_id) — usado por stats.js, track.js y
// todas las functions nuevas de newsletter. Centraliza el patrón que antes estaba
// duplicado en cada function.
const { Pool } = require('pg');

let pool;
function getPool() {
  if (pool) return pool;

  let connectionString = process.env.vidigoztv_db_id || '';
  if (!connectionString) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const m = envContent.match(/^vidigoztv_db_id\s*=\s*(.+)$/m);
      if (m) connectionString = m[1].trim();
    } catch {
      // sin .env disponible — se queda con env vars
    }
  }

  pool = new Pool({ connectionString, max: 3 });
  return pool;
}

module.exports = { getPool };
