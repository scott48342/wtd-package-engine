const fs = require('fs');
const path = require('path');

/**
 * Applies db/schema.sql (idempotent) to ensure required tables exist.
 * Safe to run on every boot.
 */
async function initSchema({ db }) {
  // schema.sql lives at repo root: db/schema.sql
  const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  let sql = fs.readFileSync(schemaPath, 'utf8');
  // Remove BOM if present
  sql = sql.replace(/^\uFEFF/, '');
  await db.query(sql);
}

module.exports = { initSchema };
