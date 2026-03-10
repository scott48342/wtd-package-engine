class PackageEngineService {
  /**
   * @param {{vehicleService:any, fitmentService:any, wheelService:any, tireService:any, tireSizeService:any}} deps
   */
  constructor({ vehicleService, fitmentService, wheelService, tireService, tireSizeService }) {
    this.vehicleService = vehicleService;
    this.fitmentService = fitmentService;
    this.wheelService = wheelService;
    this.tireService = tireService;
    this.tireSizeService = tireSizeService;
  }

  /**
   * Generate package recommendations.
   * MVP: uses wheel search + fitment constraints; tire integration can be added later.
   */
  async plusSize({ vehicleId, vehicleModificationId = null, fitmentProfile = 'stock', targetDiameter, tolerancePct = 3, maxTireWidthDelta = 20, wheelPageSize = 20 }) {
    const vehicle = await this.vehicleService.getVehicleById(vehicleId);
    if (!vehicle) {
      const err = new Error('vehicle_not_found');
      err.status = 404;
      throw err;
    }

    const fitment = await this.fitmentService.getFitmentForVehicle(vehicle, { vehicleModificationId });
    const oem = (fitment?.fitment?.oemTireSizes || []).map(normalizeTireSize).filter(Boolean);

    const baselineTireSize = oem[0] || null;
    const baselineParsed = baselineTireSize ? this.tireSizeService.parseSize(baselineTireSize) : null;
    const baselineGeom = baselineParsed ? this.tireSizeService.computeGeometry(baselineParsed) : null;

    const targetDia = Number(targetDiameter);
    if (!Number.isFinite(targetDia)) {
      const err = new Error('targetDiameter_required');
      err.status = 400;
      throw err;
    }

    const recTires = baselineParsed && baselineGeom
      ? recommendPlusSizeTires({
        base: { parsed: baselineParsed, geom: baselineGeom },
        targetWheelDiameterIn: targetDia,
        tolerancePct,
        maxTireWidthDelta
      })
      : [];

    // Wheel recommendations for target diameter.
    const wheelData = await this.wheelService.listCompatibleWheels({
      vehicleId,
      vehicleModificationId,
      fitmentProfile,
      page: 1,
      pageSize: wheelPageSize,
      targetDiameter: targetDia
    });

    return {
      vehicleId,
      vehicle: { id: vehicle.id, year: vehicle.year, make: vehicle.make, model: vehicle.model },
      targetDiameter: targetDia,
      baselineTireSize,
      baselineOverallDiameterIn: baselineGeom?.overallDiameterIn ?? null,
      tolerancePct,
      recommendedTireSizes: recTires,
      wheels: wheelData
    };
  }

  async recommend({ vehicleId, preferences }) {
    const vehicle = await this.vehicleService.getVehicleById(vehicleId);
    if (!vehicle) {
      const err = new Error('vehicle_not_found');
      err.status = 404;
      throw err;
    }

    const fitment = await this.fitmentService.getFitmentForVehicle(vehicle);

    // Tire-size comparison settings
    const plusSize = {
      warnPercent: 3.0, // warn if overall diameter differs by > 3.0%
      maxPercent: 5.0   // hard fail threshold
    };

    const baseTireSize =
      preferences?.tireSize ||
      preferences?.size ||
      fitment?.fitment?.oemTireSizes?.[0] ||
      null;

    // Wheel query derived from preferences + fitment
    const wheelQuery = {
      page: 1,
      pageSize: 20,
      fields: 'inventory,price',
      priceType: 'msrp',
      availabilityType: 'AVAILABLE',
      realTimeInventory: false
    };

    if (preferences?.wheelDiameter) wheelQuery.diameter = Number(preferences.wheelDiameter);
    if (preferences?.boltPattern) wheelQuery.boltPattern = preferences.boltPattern;
    if (!wheelQuery.boltPattern && fitment?.fitment?.boltPattern) wheelQuery.boltPattern = fitment.fitment.boltPattern;

    if (preferences?.brand) wheelQuery.brand = preferences.brand;
    if (preferences?.finish) wheelQuery.finish = preferences.finish;
    if (preferences?.minOffset != null) wheelQuery.minOffset = Number(preferences.minOffset);
    if (preferences?.maxOffset != null) wheelQuery.maxOffset = Number(preferences.maxOffset);

    const wheelResults = await this.wheelService.searchWheels(wheelQuery);

    // Tire query: use base size if known, otherwise try wheel diameter preference/fitment.
    const inferredWheelDia = preferences?.wheelDiameter || null;
    const tireQuery = {
      vehicleId,
      size: baseTireSize,
      wheelDiameter: inferredWheelDia
    };
    const tireResults = await this.tireService.searchTires(tireQuery);

    const tires = (tireResults.results || []).slice(0, 10);

    const recs = (wheelResults.results || []).slice(0, 10).map((w, idx) => {
      const t = tires[idx % Math.max(tires.length, 1)] || null;

      const warnings = [];
      let ok = true;

      if (!baseTireSize) warnings.push('No base/OEM tire size available; plus-size comparison skipped');
      if (!t) warnings.push('No tire results available');

      // Compare tire overall diameter to base size
      if (baseTireSize && t?.properties?.size) {
        const cmp = this.tireSizeService.compareByDiameter(baseTireSize, t.properties.size);
        if (cmp) {
          const pct = Math.abs(cmp.percentDifference);
          if (pct > plusSize.warnPercent) {
            warnings.push(`plus-size warning: ${baseTireSize} → ${t.properties.size} overall diameter Δ ${cmp.percentDifference}% (${cmp.deltaOverallDiameterIn}in)`);
          }
          if (pct > plusSize.maxPercent) {
            ok = false;
            warnings.push(`plus-size FAIL: diameter difference ${pct}% exceeds ${plusSize.maxPercent}% threshold`);
          }
        } else {
          warnings.push(`Unable to parse/compare tire sizes: base=${baseTireSize}, candidate=${t?.properties?.size}`);
        }
      }

      return {
        score: 1 - (idx * 0.02),
        ranking: {
          margin: null,
          stockConfidence: null,
          shippingSpeedScore: null,
          supplierPriority: 10
        },
        wheel: w,
        tire: t,
        pricing: {
          currency: preferences?.currencyCode || 'USD'
        },
        availability: {
          wheelMaxQty: w?.inventory?.globalStock ?? null,
          tireMaxQty: t?.inventory?.globalStock ?? null,
          okForMinQuantity: true
        },
        fitment: {
          ok,
          warnings
        }
      };
    });

    return {
      vehicleId,
      fitment,
      baseTireSize,
      plusSize,
      recommendations: recs
    };
  }
}

function normalizeTireSize(s) {
  if (!s) return null;
  // Ignore ZR, strip load/speed suffixes.
  return String(s)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace('ZR', 'R')
    .replace(/(\d{3}\/\d{2,3}R\d{2}(?:\.\d)?).*/, '$1');
}

function recommendPlusSizeTires({ base, targetWheelDiameterIn, tolerancePct, maxTireWidthDelta }) {
  const baseWidth = base.parsed.widthMm;
  const baseOd = base.geom.overallDiameterIn;

  const widths = [];
  for (let d = 0; d <= maxTireWidthDelta; d += 10) {
    widths.push(baseWidth + d);
    if (d !== 0) widths.push(baseWidth - d);
  }

  const out = [];

  for (const w of widths) {
    if (!Number.isFinite(w) || w < 155 || w > 405) continue;

    // Solve aspect ratio to match overall diameter:
    // baseOd = targetDia + 2 * (w * (ar/100))/25.4
    const sidewallIn = (baseOd - targetWheelDiameterIn) / 2;
    if (sidewallIn <= 0) continue;

    const arRaw = (sidewallIn * 25.4) / w * 100;
    if (!Number.isFinite(arRaw)) continue;

    // Round to nearest 5 (common aspect ratios)
    const ar = Math.round(arRaw / 5) * 5;
    if (ar < 20 || ar > 85) continue;

    const size = `${w}/${ar}R${targetWheelDiameterIn % 1 === 0 ? targetWheelDiameterIn.toFixed(0) : String(targetWheelDiameterIn)}`;

    // compute overall diameter manually
    const sidewall2In = (w * (ar / 100)) / 25.4;
    const od = targetWheelDiameterIn + (2 * sidewall2In);

    const delta = od - baseOd;
    const pct = (delta / baseOd) * 100;

    if (Math.abs(pct) > tolerancePct) continue;

    out.push({
      size,
      overallDiameterIn: Math.round(od * 1000) / 1000,
      deltaOverallDiameterIn: Math.round(delta * 1000) / 1000,
      deltaPct: Math.round(pct * 1000) / 1000
    });
  }

  // Deduplicate and rank by |deltaPct|
  const seen = new Set();
  const uniq = [];
  for (const r of out.sort((a, b) => Math.abs(a.deltaPct) - Math.abs(b.deltaPct))) {
    if (seen.has(r.size)) continue;
    seen.add(r.size);
    uniq.push(r);
  }

  return uniq;
}

module.exports = { PackageEngineService };
