/*
  Initialize Railway Postgres schema without psql.

  Usage (PowerShell):
    $env:DATABASE_URL = "postgresql://user:pass@host:port/db"
    node scripts/railway_init_db.js

  It will execute db/schema.sql against DATABASE_URL.
*/

const fs = require('fs');
const path = require('path');
const pg = require('pg');

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(v).trim();
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  let sql = fs.readFileSync(schemaPath, 'utf8');
  // Remove BOM if present.
  sql = sql.replace(/^\uFEFF/, '');

  const client = new pg.Client({ connectionString: databaseUrl });

  console.log('Connecting to database…');
  await client.connect();

  try {
    console.log('Applying schema.sql…');
    await client.query(sql);
    console.log('Schema applied. Verifying tables…');
    const out = await client.query(
      `select table_name from information_schema.tables where table_schema='public' order by table_name;`
    );
    console.log(`Found ${out.rowCount} tables in public schema.`);
    const names = out.rows.map((r) => r.table_name);
    // Print a small, useful subset.
    const interesting = names.filter((n) => n.startsWith('vehicle') || n === 'product' || n === 'supplier');
    if (interesting.length) console.log('Key tables:', interesting.join(', '));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('DB init failed:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
