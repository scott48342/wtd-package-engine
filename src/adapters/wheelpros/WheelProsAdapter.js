const { WheelProsAuthClient, WheelProsProductsClient } = require('./wheelprosClient');

/**
 * WheelProsAdapter implements WheelSupplierAdapter.
 * Normalizes Wheel Pros Product API responses.
 */
class WheelProsAdapter {
  constructor({ authBaseUrl, productsBaseUrl, userName, password, company, customer, currencyCode }) {
    this.code = 'WHEELPROS';
    this.company = company;
    this.customer = customer;
    this.currencyCode = currencyCode;

    this.auth = new WheelProsAuthClient({ authBaseUrl, userName, password });
    this.products = new WheelProsProductsClient({ productsBaseUrl, authClient: this.auth });
  }

  getCapabilities() {
    return { code: this.code, mode: 'api', supportsRealtimeInventory: true };
  }

  /**
   * @param {object} query
   */
  async searchWheels(query = {}) {
    const params = {
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      // By default request inventory + price.
      fields: query.fields || 'inventory,price',
      priceType: query.priceType || 'msrp',
      company: query.company || this.company,
      customer: query.customer || this.customer,
      currencyCode: query.currencyCode || this.currencyCode,
      availabilityType: query.availabilityType || 'AVAILABLE',
      realTimeInventory:
        query.realTimeInventory !== undefined ? query.realTimeInventory : false,
      ...query
    };

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