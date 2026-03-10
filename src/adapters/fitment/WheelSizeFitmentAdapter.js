const { WheelSizeClient } = require('./wheelSizeClient');

/**
 * Fitment provider adapter for Wheel-Size API.
 *
 * API docs: https://api.wheel-size.com/v2/swagger/
 * Auth: `user_key` query param.
 */
class WheelSizeFitmentAdapter {
  /**
   * @param {{baseUrl:string, apiKey:string, defaultRegion?:string}} opts
   */
  constructor({ baseUrl, apiKey, defaultRegion = 'usdm' }) {
    this.code = 'WHEEL_SIZE_API';
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.defaultRegion = defaultRegion;

    this.client = new WheelSizeClient({ baseUrl, apiKey });
  }

  getCapabilities() {
    return { code: this.code, mode: 'api', supportsVinLookup: false };
  }

  /**
   * Returns normalized fitment contract:
   * - boltPattern
   * - centerBoreMm
   * - wheelDiameterRangeIn
   * - wheelWidthRangeIn
   * - offsetRangeMm
   * - oemTireSizes
   *
   * @param {{year:number, make:string, model:string, submodel?:string, trim?:string, modification?:string}} vehicle
   */
  async getFitment(vehicle) {
    if (!this.baseUrl) throw new Error('WheelSize fitment provider not configured (WHEEL_SIZE_BASE_URL)');
    if (!this.apiKey) throw new Error('WheelSize fitment provider not configured (WHEEL_SIZE_API_KEY)');

    const year = Number(vehicle.year);
    if (!Number.isFinite(year)) throw new Error('WheelSizeFitmentAdapter.getFitment requires vehicle.year');

    const makeSlug = await this._resolveMakeSlug(vehicle.make, year);
    const modelSlug = await this._resolveModelSlug(makeSlug, vehicle.model, year);

    // Preferred: if caller already has a Wheel-Size modification slug/id, use it directly.
    // Otherwise, if trim provided, try to resolve a modification slug for better accuracy.
    const modificationSlug = vehicle.modification
      ? String(vehicle.modification)
      : vehicle.trim
        ? await this._resolveModificationSlug({ makeSlug, modelSlug, year, trim: vehicle.trim })
        : null;

    // Swagger requires make+model + (year|generation) + (modification|region)
    const payload = await this.client.searchByModel({
      make: makeSlug,
      model: modelSlug,
      year,
      modification: modificationSlug || undefined,
      region: modificationSlug ? undefined : this.defaultRegion
    });

    const rows = payload?.data || [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        boltPattern: null,
        centerBoreMm: null,
        wheelDiameterRangeIn: [null, null],
        wheelWidthRangeIn: [null, null],
        offsetRangeMm: [null, null],
        oemTireSizes: [],
        confidence: 0.2,
        quality: 'no_results'
      };
    }

    return normalizeFitmentFromSearchByModel(rows);
  }

  async _resolveMakeSlug(makeName, year) {
    const guess = slugify(makeName);

    // Quick path: if guess works for models(), keep it.
    try {
      await this.client.models({ make: guess, year });
      return guess;
    } catch {
      // continue
    }

    // Slow path: list makes and match.
    const makesPayload = await this.client.makes({ year });
    const makes = makesPayload?.data || [];
    const found = makes.find((m) =>
      eqName(m?.name, makeName) ||
      eqName(m?.name_en, makeName) ||
      eqSlug(m?.slug, guess)
    );

    if (!found?.slug) throw new Error(`WheelSize: unable to resolve make slug for '${makeName}'`);
    return found.slug;
  }

  async _resolveModelSlug(makeSlug, modelName, year) {
    const guess = slugify(modelName);

    try {
      const payload = await this.client.models({ make: makeSlug, year });
      const models = payload?.data || [];
      const found = models.find((m) =>
        eqName(m?.name, modelName) ||
        eqName(m?.name_en, modelName) ||
        eqSlug(m?.slug, guess)
      );
      if (found?.slug) return found.slug;
    } catch {
      // continue
    }

    // Best-effort fallback.
    return guess;
  }

  async listTrims({ year, make, model }) {
    const y = Number(year);
    if (!Number.isFinite(y)) throw new Error('year_required');

    const makeSlug = await this._resolveMakeSlug(make, y);
    const modelSlug = await this._resolveModelSlug(makeSlug, model, y);

    const payload = await this.client.modifications({ make: makeSlug, model: modelSlug, year: y });
    const mods = payload?.data || [];
    if (!Array.isArray(mods)) return [];

    // Normalize to {modification, trim}
    const out = mods
      .map((m) => ({
        modification: m?.slug || null,
        trim: m?.trim || m?.name || m?.slug || null,
        trimLevel: m?.trim_level ?? null,
        trimScoring: m?.trim_scoring ?? null
      }))
      .filter((m) => m.modification && m.trim);

    // De-dupe by modification
    const seen = new Set();
    const uniq = [];
    for (const t of out) {
      if (seen.has(t.modification)) continue;
      seen.add(t.modification);
      uniq.push(t);
    }

    // Sort for nicer UI: trim_scoring desc, then trim asc
    uniq.sort((a, b) => (Number(b.trimScoring) || 0) - (Number(a.trimScoring) || 0) || String(a.trim).localeCompare(String(b.trim)));

    return uniq;
  }

  async _resolveModificationSlug({ makeSlug, modelSlug, year, trim }) {
    const payload = await this.client.modifications({
      make: makeSlug,
      model: modelSlug,
      year,
      trim
    });

    const mods = payload?.data || [];
    if (!Array.isArray(mods) || mods.length === 0) return null;

    // Prefer the best trim scoring if present.
    const best = mods
      .slice()
      .sort((a, b) => (Number(b?.trim_scoring) || 0) - (Number(a?.trim_scoring) || 0))[0];

    return best?.slug || null;
  }
}

function normalizeFitmentFromSearchByModel(rows) {
  const tech = rows.find((r) => r?.technical)?.technical || {};

  const boltPattern = tech.bolt_pattern || null;
  const centerBoreMm = parseMaybeNumber(tech.centre_bore) ?? parseMaybeNumber(tech.rear_axis_centre_bore) ?? null;

  const stockWheelPairs = rows
    .flatMap((r) => (Array.isArray(r?.wheels) ? r.wheels : []))
    .filter((wp) => wp?.is_stock);

  const diaVals = [];
  const widthVals = [];
  const offsetVals = [];
  const oemTires = [];

  for (const wp of stockWheelPairs) {
    for (const axle of ['front', 'rear']) {
      const a = wp?.[axle];
      if (!a) continue;

      if (a.rim_diameter != null) diaVals.push(Number(a.rim_diameter));
      if (a.rim_width != null) widthVals.push(Number(a.rim_width));
      if (a.rim_offset != null) offsetVals.push(Number(a.rim_offset));

      const t = String(a.tire_full || a.tire || '').trim();
      if (t) {
        const m = t.match(/(\d{3}\/\d{2,3}R\d{2}(?:\.\d)?)/i);
        oemTires.push((m ? m[1] : t).toUpperCase());
      }
    }
  }

  const wheelSizes = Array.from(
    new Set(
      stockWheelPairs
        .flatMap((wp) => ['front', 'rear'].map((axle) => wp?.[axle]).filter(Boolean))
        .map((a) => {
          const d = parseMaybeNumber(a?.rim_diameter);
          const w = parseMaybeNumber(a?.rim_width);
          const off = parseMaybeNumber(a?.rim_offset);
          if (d == null && w == null && off == null) return null;
          // stable key for de-dupe
          return JSON.stringify({ diameterIn: d, widthIn: w, offsetMm: off });
        })
        .filter(Boolean)
    )
  ).map((s) => JSON.parse(s));

  return {
    boltPattern,
    centerBoreMm,
    wheelDiameterRangeIn: range(diaVals),
    wheelWidthRangeIn: range(widthVals),
    offsetRangeMm: range(offsetVals),
    oemTireSizes: Array.from(new Set(oemTires)).sort(),
    wheelSizes,

    // Rough metadata for FitmentService provenance.
    confidence: stockWheelPairs.length ? 0.85 : 0.6,
    quality: stockWheelPairs.length ? 'ok' : 'no_stock_wheel_pairs'
  };
}

function range(nums) {
  const finite = nums.filter((n) => Number.isFinite(n));
  if (!finite.length) return [null, null];
  return [Math.min(...finite), Math.max(...finite)];
}

function parseMaybeNumber(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === 'N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function eqName(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function eqSlug(a, b) {
  return eqName(a, b);
}

module.exports = { WheelSizeFitmentAdapter };
