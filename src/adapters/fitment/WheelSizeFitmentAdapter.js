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
    // IMPORTANT: Wheel-Size sometimes omits optional OEM packages when querying by modification.
    // To avoid losing valid OEM tire sizes (e.g. 275/65R20 on Silverado 2500HD), we merge:
    //   - region-level fitment (broader OEM/optional packages)
    //   - modification-level fitment (more precise when present)

    const payloadBase = await this.client.searchByModel({
      make: makeSlug,
      model: modelSlug,
      year,
      region: this.defaultRegion
    });

    const baseRows = payloadBase?.data || [];

    const payloadMod = modificationSlug
      ? await this.client.searchByModel({
          make: makeSlug,
          model: modelSlug,
          year,
          modification: modificationSlug
        })
      : null;

    const modRows = payloadMod?.data || [];

    const baseFit = Array.isArray(baseRows) && baseRows.length ? normalizeFitmentFromSearchByModel(baseRows) : null;
    const modFit = Array.isArray(modRows) && modRows.length ? normalizeFitmentFromSearchByModel(modRows) : null;

    const merged = mergeFitments(baseFit, modFit);

    if (!merged) {
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

    return merged;
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

    // Prefer marketing trim levels when available.
    // Many vehicles have trim_levels[] inside each modification (where modification is often engine/drive).
    // We expand those into user-facing trim options while keeping the correct modification slug.
    const expanded = [];

    for (const m of mods) {
      const modification = m?.slug || null;
      if (!modification) continue;

      const engine = m?.engine || null;
      const engineLabel = engine?.capacity && engine?.fuel
        ? `${engine.capacity}L ${engine.fuel}`
        : engine?.fuel || null;

      const levels = Array.isArray(m?.trim_levels) ? m.trim_levels.filter(Boolean) : [];

      if (levels.length) {
        for (const level of levels) {
          expanded.push({
            modification,
            trim: String(level),
            trimLevel: String(level),
            trimScoring: m?.trim_scoring ?? null,
            engine: engineLabel,
            engineCode: engine?.code || null
          });
        }
      } else {
        // Fallback: use whatever Wheel-Size calls trim/name (often engine-based)
        expanded.push({
          modification,
          trim: m?.trim || m?.name || m?.slug || null,
          trimLevel: m?.trim_level ?? null,
          trimScoring: m?.trim_scoring ?? null,
          engine: engineLabel,
          engineCode: engine?.code || null
        });
      }
    }

    const out = expanded.filter((t) => t.modification && t.trim);

    // De-dupe by *trim label + engine* so we can show e.g. LT (Gas) and LT (Diesel)
    const bestByKey = new Map();
    for (const t of out) {
      const key = `${String(t.trim).trim().toLowerCase()}|${String(t.engine || '').trim().toLowerCase()}`;
      const existing = bestByKey.get(key);
      if (!existing) {
        bestByKey.set(key, t);
        continue;
      }
      const aScore = Number(existing.trimScoring) || 0;
      const bScore = Number(t.trimScoring) || 0;
      if (bScore > aScore) {
        bestByKey.set(key, t);
        continue;
      }
      if (bScore === aScore && String(t.modification) < String(existing.modification)) {
        bestByKey.set(key, t);
      }
    }

    const uniq = Array.from(bestByKey.values());

    // Sort: trim asc, then engine asc (keeps WT/LT/LTZ grouped)
    uniq.sort((a, b) => String(a.trim).localeCompare(String(b.trim)) || String(a.engine || '').localeCompare(String(b.engine || '')));

    return uniq;
  }

  async resolveModificationForTrimLevel({ year, make, model, trimLevel }) {
    const y = Number(year);
    if (!Number.isFinite(y)) throw new Error('year_required');

    const makeSlug = await this._resolveMakeSlug(make, y);
    const modelSlug = await this._resolveModelSlug(makeSlug, model, y);

    const payload = await this.client.modifications({
      make: makeSlug,
      model: modelSlug,
      year: y,
      trimLevel: String(trimLevel)
    });

    const mods = payload?.data || [];
    if (!Array.isArray(mods) || !mods.length) return null;

    // pick best scoring mod
    const best = mods
      .slice()
      .sort((a, b) => (Number(b?.trim_scoring) || 0) - (Number(a?.trim_scoring) || 0) || String(a?.slug).localeCompare(String(b?.slug)))[0];

    if (!best?.slug) return null;

    return {
      modification: best.slug,
      trim: String(trimLevel),
      trimLevel: String(trimLevel),
      engine: best?.engine?.capacity && best?.engine?.fuel ? `${best.engine.capacity}L ${best.engine.fuel}` : (best?.engine?.fuel || null),
      engineCode: best?.engine?.code || null
    };
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

function mergeFitments(baseFit, modFit) {
  if (!baseFit && !modFit) return null;
  if (baseFit && !modFit) return baseFit;
  if (!baseFit && modFit) return modFit;

  const allTires = Array.from(new Set([...(baseFit.oemTireSizes || []), ...(modFit.oemTireSizes || [])])).sort();

  const wheelSizes = Array.from(
    new Set([...(baseFit.wheelSizes || []), ...(modFit.wheelSizes || [])].map((w) => JSON.stringify(w)))
  ).map((s) => JSON.parse(s));

  const allDia = wheelSizes.map((w) => Number(w?.diameterIn)).filter((n) => Number.isFinite(n));
  const allWid = wheelSizes.map((w) => Number(w?.widthIn)).filter((n) => Number.isFinite(n));
  const allOff = wheelSizes.map((w) => Number(w?.offsetMm)).filter((n) => Number.isFinite(n));

  const diaRange = allDia.length
    ? [Math.min(...allDia), Math.max(...allDia)]
    : (modFit.wheelDiameterRangeIn || baseFit.wheelDiameterRangeIn);
  const widRange = allWid.length
    ? [Math.min(...allWid), Math.max(...allWid)]
    : (modFit.wheelWidthRangeIn || baseFit.wheelWidthRangeIn);
  const offRange = allOff.length
    ? [Math.min(...allOff), Math.max(...allOff)]
    : (modFit.offsetRangeMm || baseFit.offsetRangeMm);

  return {
    boltPattern: modFit.boltPattern || baseFit.boltPattern,
    centerBoreMm: modFit.centerBoreMm ?? baseFit.centerBoreMm,
    wheelDiameterRangeIn: diaRange,
    wheelWidthRangeIn: widRange,
    offsetRangeMm: offRange,
    oemTireSizes: allTires,
    wheelSizes,
    confidence: Math.max(Number(baseFit.confidence) || 0, Number(modFit.confidence) || 0),
    quality: 'merged_region_plus_mod'
  };
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
