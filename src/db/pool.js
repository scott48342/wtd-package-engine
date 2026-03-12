const pg = require('pg');

/** @param {{databaseUrl: string}} opts */
function createPool(opts) {
  return new pg.Pool({
    connectionString: opts.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000
  });
}

module.exports = { createPool };
