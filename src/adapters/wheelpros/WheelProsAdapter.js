const { WheelProsAuthClient, WheelProsProductsClient } = require('./wheelprosClient');

/**
 * WheelProsAdapter implements WheelSupplierAdapter.
 * Normalizes Wheel Pros Product API responses.
 */
class WheelProsAdapter {
  constructor({ authBaseUrl, productsBaseUrl, userName, password, company, currencyCode }) {
    this.code = 'WHEELPROS';
    this.company = company;
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
  async searchWheels(query) {
    const params = { ...query };

    // If priceType present, ensure company present
    if (params.priceType && !params.company) params.company = this.company;
    if (params.currencyCode == null) params.currencyCode = this.currencyCode;

    const res = await this.products.request({
      method: 'GET',
      url: '/v1/search/wheel',
      params
    });

    return res.data;
  }

  async getWheelDetails(externalSku) {
    const res = await this.products.request({
      method: 'GET',
      url: `/v1/details/${encodeURIComponent(externalSku)}`
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
    const tpmsBool = tpms == null ? null : (Number(tpms) === 1);

    const load = p.loadRating;
    const loadLbs = typeof load === 'string' ? parseMaybeNumber(load.split('/')[0]) : parseMaybeNumber(load);

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
        const amount = parseMaybeNumber(p.currencyAmount);
        const currency = p.currencyCode || this.currencyCode;
        if (amount != null) out.push({ priceType, amount, currency });
      }
    }
    return out;
  }
}

function parseMaybeNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

module.exports = { WheelProsAdapter };
