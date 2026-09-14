#!/usr/bin/env node
// Corre la migración SQL del newsletter contra vidigoztv_db_id.
// Uso: node scripts/migrate.js
const fs = require('fs');
const path = require('path');
const { Pool } = require(path.join(__dirname, '..', 'netlify', 'functions', 'node_modules', 'pg'));

function getConnectionString() {
  let cs = process.env.vidigoztv_db_id || '';
  if (!cs) {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const m = envContent.match(/^vidigoztv_db_id\s*=\s*(.+)$/m);
    if (m) cs = m[1].trim();
  }
  return cs;
}

async function main() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    console.error('No se encontró vidigoztv_db_id (env var ni .env).');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, '..', 'netlify', 'functions', '_migrations', '001_newsletter.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const pool = new Pool({ connectionString, max: 1 });
  try {
    console.log('Corriendo migración 001_newsletter.sql...');
    await pool.query(sql);
    console.log('Migración aplicada correctamente.');

    const tables = ['subscribers', 'sends', 'send_events', 'send_recipients'];
    for (const t of tables) {
      const r = await pool.query(`SELECT count(*)::int AS count FROM ${t}`);
      console.log(`  ✓ tabla "${t}" existe (${r.rows[0].count} filas)`);
    }
  } catch (err) {
    console.error('Error corriendo la migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
