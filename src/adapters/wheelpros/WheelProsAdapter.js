const { WheelProsAuthClient, WheelProsProductsClient, WheelProsPricingClient } = require('./wheelprosClient');

/**
 * WheelProsAdapter implements WheelSupplierAdapter.
 * Normalizes Wheel Pros Product API responses.
 */
class WheelProsAdapter {
  constructor({ authBaseUrl, productsBaseUrl, pricingBaseUrl, userName, password, company, customer, currencyCode }) {
    this.code = 'WHEELPROS';
    this.company = company;
    this.customer = customer;
    this.currencyCode = currencyCode;

    this.auth = new WheelProsAuthClient({ authBaseUrl, userName, password });
    this.products = new WheelProsProductsClient({ productsBaseUrl, authClient: this.auth });

    // Pricing API is separate from Products API.
    this.pricing = new WheelProsPricingClient({
      pricingBaseUrl: pricingBaseUrl || 'https://dev.api.wheelpros.com/pricings',
      authClient: this.auth
    });
  }

  getCapabilities() {
    return { code: this.code, mode: 'api', supportsRealtimeInventory: true };
  }

  /**
   * @param {object} query
   */
  async searchWheels(query = {}) {
    // IMPORTANT: WheelPros search behavior changes based on pricing-related query params.
    // In practice, sending fields/priceType/company/currencyCode has resulted in null prices.
    // So we keep the default query minimal and only pass pricing params when explicitly requested.
    const params = {
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      // Keep supplier defaults minimal; allow the caller to opt-in to additional filters.
      ...query
    };

    // Only set pricing-related parameters if the caller explicitly requests them.
    if (query.fields != null) params.fields = query.fields;
    if (query.priceType != null) params.priceType = query.priceType;
    if (query.company != null) params.company = query.company;
    if (query.currencyCode != null) params.currencyCode = query.currencyCode;
    if (query.customer != null) params.customer = query.customer;

    // Only set availabilityType/realTimeInventory if explicitly provided.
    if (query.availabilityType == null) delete params.availabilityType;
    if (query.realTimeInventory == null) delete params.realTimeInventory;

    // WheelPros API is picky about some numeric filters (e.g. diameter must be "20.0", not 20).
    if (params.diameter != null) {
      const n = Number(params.diameter);
      if (Number.isFinite(n)) params.diameter = n % 1 === 0 ? n.toFixed(1) : String(n);
    }
    if (params.width != null) {
      const n = Number(params.width);
      // Spec says string; send normalized numeric string.
      if (Number.isFinite(n)) params.width = n % 1 === 0 ? n.toFixed(1) : String(n);
    }

    // Avoid sending empty customer param.
    if (!params.customer) delete params.customer;
    if (!params.company) delete params.company;
    if (!params.currencyCode) delete params.currencyCode;
    if (!params.fields) delete params.fields;
    if (!params.priceType) delete params.priceType;

    const res = await this.products.request({
      method: 'GET',
      url: 'v1/search/wheel',
      params
    });

    return res.data;
  }

  async getWheelDetails(externalSku) {
    const res = await this.products.request({
      method: 'GET',
      url: `v1/details/${encodeURIComponent(externalSku)}`
    });

    return res.data;
  }

  async searchTires(query = {}) {
    const params = {
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      ...query
    };

    // Remove undefined/empty
    for (const k of Object.keys(params)) {
      if (params[k] === undefined || params[k] === '') delete params[k];
    }

    const res = await this.products.request({
      method: 'GET',
      url: 'v1/search/tire',
      params
    });

    return res.data;
  }

  /**
   * Fetch MSRP pricing from the WheelPros Pricing API for a set of SKUs.
   * @param {string[]} skus
   * @param {{company?: string|number, currency?: string, customer?: string, effectiveDate?: string}} opts
   * @returns {Promise<Map<string, {amount:number, currency:string, priceType:string}>>}
   */
  async getMsrpBySku(skus = [], opts = {}) {
    const unique = Array.from(new Set((skus || []).filter(Boolean)));
    if (!unique.length) return new Map();

    const body = {
      filters: {
        sku: unique,
        company: String(opts.company ?? this.company),
        currency: String(opts.currency ?? this.currencyCode),
        ...(opts.customer || this.customer ? { customer: String(opts.customer ?? this.customer) } : {}),
        ...(opts.effectiveDate ? { effectiveDate: String(opts.effectiveDate) } : {})
      },
      limit: unique.length,
      priceType: ['msrp']
    };

    const res = await this.pricing.request({
      method: 'POST',
      url: 'v1/search',
      data: body
    });

    const out = new Map();
    const rows = Array.isArray(res.data) ? res.data : [];
    for (const row of rows) {
      const sku = row?.sku;
      const msrpArr = row?.prices?.msrp;
      const p0 = Array.isArray(msrpArr) ? msrpArr[0] : null;
      const amount = parseMaybeNumber(p0?.currencyAmount);
      const currency = p0?.currencyCode || this.currencyCode;
      if (sku && amount != null) out.set(sku, { amount, currency, priceType: 'msrp' });
    }

    return out;
  }

  /**
   * Normalize a Wheel Pros wheel record (from search or details) into a spec row.
   * @param {any} rec
   */
  toWheelSpec(rec) {
    const p = rec?.properties || {};
    const inv = rec?.inventory || {};

    const tpms = p.tpmsCompatible;
    const tpmsBool = tpms == null ? null : Number(tpms) === 1;

    const load = p.loadRating;
    const loadLbs =
      typeof load === 'string'
        ? parseMaybeNumber(load.split('/')[0])
        : parseMaybeNumber(load);

    return {
      diameterIn: parseMaybeNumber(p.diameter),
      widthIn: parseMaybeNumber(p.width),
      offsetMm: parseMaybeNumber(p.offset),
      boltPattern: p.boltPattern || null,
      centerBoreMm: parseMaybeNumber(p.centerbore || p.centerBore || p.center_bore_mm),
      finish: p.finish || null,
      finishCode: p.finishCode || null,
      model: p.model || rec?.model || null,
      tpmsCompatible: tpmsBool,
      loadRatingLbs: loadLbs,
      inventoryType: inv.type || null
    };
  }

  /**
   * Normalize inventory snapshot.
   */
  toInventory(rec) {
    const inv = rec?.inventory || {};
    return {
      localStock: inv.localStock ?? null,
      globalStock: inv.globalStock ?? null,
      inventoryType: inv.type ?? null
    };
  }

  /**
   * Normalize pricing snapshot. Returns a flat array of {priceType, amount, currency}.
   */
  toPrices(rec) {
    const prices = rec?.prices || {};
    const out = [];

    for (const [priceType, arr] of Object.entries(prices)) {
      if (!Array.isArray(arr)) continue;

      for (const p of arr) {
        // WheelPros uses currencyAmount; it can be null when pricing isn't available.
        const amount = parseMaybeNumber(p.currencyAmount ?? p.amount ?? p.value);
        const currency = p.currencyCode || this.currencyCode;
        if (amount != null) out.push({ priceType, amount, currency });
      }
    }

    return out;
  }

  /**
   * Pick the best available MSRP-like price from a record.
   * Prefers msrp, then map, then nip.
   */
  extractMsrp(rec) {
    const prices = rec?.prices || {};
    for (const key of ['msrp', 'map', 'nip']) {
      const arr = prices[key];
      if (!Array.isArray(arr) || !arr[0]) continue;
      const amount = parseMaybeNumber(arr[0].currencyAmount ?? arr[0].amount ?? arr[0].value);
      const currency = arr[0].currencyCode || this.currencyCode;
      if (amount != null) return { amount, currency, priceType: key };
    }
    return null;
  }
}


function parseMaybeNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

module.exports = { WheelProsAdapter };