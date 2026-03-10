const { WheelSizeClient } = require('../adapters/fitment/wheelSizeClient');

class WheelSizeCatalogService {
  /**
   * @param {{db: import('pg').Pool, baseUrl: string, apiKey: string, cacheTtlDays: number, region?: string}} deps
   */
  constructor({ db, baseUrl, apiKey, cacheTtlDays = 7, region = 'usdm' }) {
    this.db = db;
    this.cacheTtlDays = cacheTtlDays;
    this.region = region;
    this.client = new WheelSizeClient({ baseUrl, apiKey });
  }

  async _ensureCacheTable() {
    // Lightweight cache table for API responses.
    await this.db.query({
      text: `
        create table if not exists api_cache (
          cache_key text primary key,
          payload jsonb not null,
          as_of timestamptz not null default now()
        )
      `
    });
  }

  async _get(cacheKey) {
    await this._ensureCacheTable();
    const { rows } = await this.db.query({
      text: `select payload, as_of from api_cache where cache_key = $1`,
      values: [cacheKey]
    });
    return rows[0] || null;
  }

  async _set(cacheKey, payload) {
    await this._ensureCacheTable();
    await this.db.query({
      text: `
        insert into api_cache (cache_key, payload, as_of)
        values ($1, $2::jsonb, now())
        on conflict (cache_key) do update set
          payload = excluded.payload,
          as_of = excluded.as_of
      `,
      values: [cacheKey, JSON.stringify(payload)]
    });
  }

  _isFresh(asOf) {
    if (!asOf) return false;
    const t = new Date(asOf).getTime();
    if (!Number.isFinite(t)) return false;
    const ageMs = Date.now() - t;
    return ageMs >= 0 && ageMs <= this.cacheTtlDays * 24 * 60 * 60 * 1000;
  }

  async listYears() {
    const key = 'wheelsize:years';
    const cached = await this._get(key);
    if (cached && this._isFresh(cached.as_of)) return cached.payload;

    const payload = await this.client.years();
    await this._set(key, payload);
    return payload;
  }

  async listMakes({ year, region } = {}) {
    const reg = region || this.region;
    const key = `wheelsize:makes:${year}:${reg}`;
    const cached = await this._get(key);
    if (cached && this._isFresh(cached.as_of)) return cached.payload;

    const payload = await this.client.makes({ year, region: reg });
    await this._set(key, payload);
    return payload;
  }

  async listModels({ year, make, region } = {}) {
    const reg = region || this.region;
    const key = `wheelsize:models:${year}:${String(make || '').toLowerCase()}:${reg}`;
    const cached = await this._get(key);
    if (cached && this._isFresh(cached.as_of)) return cached.payload;

    const payload = await this.client.models({ year, make, region: reg });
    await this._set(key, payload);
    return payload;
  }
}

module.exports = { WheelSizeCatalogService };
