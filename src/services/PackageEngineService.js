class PackageEngineService {
  /**
   * @param {{vehicleService:any, fitmentService:any, wheelService:any, tireService:any}} deps
   */
  constructor({ vehicleService, fitmentService, wheelService, tireService }) {
    this.vehicleService = vehicleService;
    this.fitmentService = fitmentService;
    this.wheelService = wheelService;
    this.tireService = tireService;
  }

  /**
   * Generate package recommendations.
   * MVP: uses wheel search + fitment constraints; tire integration can be added later.
   */
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
      warnPercent: 1.5, // warn if overall diameter differs by > 1.5%
      maxPercent: 3.0   // hard fail threshold
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
        const cmp = this.tireService.tireSizeService.compareByDiameter(baseTireSize, t.properties.size);
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

module.exports = { PackageEngineService };
