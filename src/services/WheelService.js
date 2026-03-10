const { randomUUID } = require('crypto');

class WheelService {
  

  async listCompatibleWheels({ vehicleId, vehicleModificationId = null, fitmentProfile = 'stock', page = 1, pageSize = 20, targetDiameter = null }) {
    // 1) Load vehicle fitment (scoped to modification when provided)
    const { rows } = await this.db.query({
      text: `
        select bolt_pattern, center_bore_mm,
               min_wheel_dia_in, max_wheel_dia_in,
               min_wheel_w_in, max_wheel_w_in,
               min_offset_mm, max_offset_mm
        from vehicle_fitment
        where vehicle_id = $1::uuid
          and vehicle_modification_id is not distinct from $2::uuid
        limit 1
      `,
      values: [vehicleId, vehicleModificationId]
    });

    const f = rows[0];
    if (!f) {
      return { results: [], totalCount: 0, page, pageSize, error: 'vehicle_fitment_not_found' };
    }

    const boltPattern = (f.bolt_pattern || '').trim();
    const centerBoreMm = f.center_bore_mm != null ? Number(f.center_bore_mm) : null;

    let diaMin = f.min_wheel_dia_in != null ? Number(f.min_wheel_dia_in) : null;
    let diaMax = f.max_wheel_dia_in != null ? Number(f.max_wheel_dia_in) : null;

    if (targetDiameter != null) {
      const td = Number(targetDiameter);
      if (Number.isFinite(td)) {
        diaMin = td;
        diaMax = td;
      }
    }
    const widthMin = f.min_wheel_w_in != null ? Number(f.min_wheel_w_in) : null;
    const widthMax = f.max_wheel_w_in != null ? Number(f.max_wheel_w_in) : null;
    const offMin = f.min_offset_mm != null ? Number(f.min_offset_mm) : null;
    const offMax = f.max_offset_mm != null ? Number(f.max_offset_mm) : null;

    // Compatibility tolerances
    // fitmentProfile:
    // - stock: keep close to OEM
    // - mild: allow a bit more flexibility
    // - aggressive: common leveled/lifted truck offsets
    const profile = String(fitmentProfile || 'stock').toLowerCase();
    const tolByProfile = {
      stock: { widthTol: 1, offsetTol: 10 },
      mild: { widthTol: 1.5, offsetTol: 20 },
      aggressive: { widthTol: 2, offsetTol: 35 }
    };
    const chosen = tolByProfile[profile] || tolByProfile.stock;

    const widthTol = chosen.widthTol; // inches
    const offsetTol = chosen.offsetTol; // mm

    const limit = Math.max(1, Math.min(100, Number(pageSize) || 20));
    const safePage = Math.max(1, Number(page) || 1);

    // 2) Primary strategy: query WheelPros live using fitment filters.
    // This avoids relying on our local catalog having full boltPattern/centerBore coverage.
    const supplierQuery = {
      page: safePage,
      pageSize: limit,
      // Filters
      ...(boltPattern ? { boltPattern } : {}),
      // If min==max, use exact diameter to reduce noise.
      ...(diaMin != null && diaMax != null && diaMin === diaMax ? { diameter: diaMin } : {}),
      // NOTE: WheelPros width filtering is unreliable (returns 0 even when widths exist),
      // so we do NOT pass width as a supplier filter; we post-filter locally instead.
      ...(offMin != null ? { minOffset: offMin - offsetTol } : {}),
      ...(offMax != null ? { maxOffset: offMax + offsetTol } : {}),

      // WheelPros has proven to return MSRP best with minimal params; do not force fields/priceType.
      // Our adapter will still return prices in most cases.
      realTimeInventory: false
    };

    const raw = await this.wheelAdapter.searchWheels(supplierQuery);
    const supplierResults = raw.results || raw.searchResults || [];

    const supplierCode = this.wheelAdapter.getCapabilities().code;
    const supplierId = await this._getOrCreateSupplierId(supplierCode, 'wheel');

    const results = [];

    const oemWidthIn = pickOem(widthMin, widthMax);
    const oemOffsetMm = pickOem(offMin, offMax);

    for (const r of supplierResults) {
      const identity = await this._resolveIdentity({ supplierId, supplierCode, externalSku: r.sku, skuType: 'wheel' });

      // Persist structured specs + snapshots
      await this._upsertWheelStructured({ supplierId, identity, wheelRecord: r, debugPrice: false });

      const spec = this.wheelAdapter.toWheelSpec(r);
      const inv = this.wheelAdapter.toInventory(r);
      const msrp = this.wheelAdapter.extractMsrp ? this.wheelAdapter.extractMsrp(r) : null;

      // Diameter: must match requested diameter (if diaMin==diaMax)
      if (diaMin != null && diaMax != null && diaMin === diaMax) {
        if (spec.diameterIn == null || spec.diameterIn !== diaMin) continue;
      } else {
        if (diaMin != null && spec.diameterIn != null && spec.diameterIn < diaMin) continue;
        if (diaMax != null && spec.diameterIn != null && spec.diameterIn > diaMax) continue;
      }

      // Width range filter (±1)
      if (widthMin != null && spec.widthIn != null && spec.widthIn < (widthMin - widthTol)) continue;
      if (widthMax != null && spec.widthIn != null && spec.widthIn > (widthMax + widthTol)) continue;

      // Offset range filter
      if (offMin != null && spec.offsetMm != null && spec.offsetMm < (offMin - offsetTol)) continue;
      if (offMax != null && spec.offsetMm != null && spec.offsetMm > (offMax + offsetTol)) continue;

      // Center bore rules:
      // - If known and smaller than vehicle -> reject.
      if (centerBoreMm != null && spec.centerBoreMm != null && spec.centerBoreMm < centerBoreMm) continue;

      // Fitment scoring
      let score = 100;

      // Width penalty: -5 per 0.5" difference from OEM width
      if (oemWidthIn != null && spec.widthIn != null) {
        const diff = Math.abs(spec.widthIn - oemWidthIn);
        score -= (diff / 0.5) * 5;
      }

      // Offset penalty: -1 per mm difference from OEM offset
      if (oemOffsetMm != null && spec.offsetMm != null) {
        const diff = Math.abs(spec.offsetMm - oemOffsetMm);
        score -= diff * 1;
      }

      // Center bore penalty:
      // - equal => no penalty
      // - larger => -2 points
      if (centerBoreMm != null && spec.centerBoreMm != null) {
        if (spec.centerBoreMm > centerBoreMm) score -= 2;
      }

      score = Math.max(0, Math.min(100, Math.round(score)));

      const fitmentCategory =
        score >= 90 ? 'perfect'
          : score >= 75 ? 'flush'
            : score >= 60 ? 'aggressive'
              : 'extreme';

      const primaryImage = Array.isArray(r.images) && r.images.length
        ? (r.images.find((i) => String(i.aspect || '').toLowerCase() === 'standard') || r.images[0])
        : null;

      results.push({
        sku: identity.externalSku,
        title: r.title || null,
        brand: r.brand?.description || r.brand?.parent || r.brand || null,
        diameter: spec.diameterIn,
        width: spec.widthIn,
        offset: spec.offsetMm,
        finish: spec.finish,
        primaryImage: primaryImage?.imageUrlLarge || primaryImage?.imageUrlMedium || primaryImage?.imageUrlSmall || primaryImage?.imageUrlOriginal || null,
        stock: {
          local: inv.localStock ?? null,
          global: inv.globalStock ?? null,
          type: inv.inventoryType ?? null
        },
        msrp: msrp ? { amount: msrp.amount, currency: msrp.currency, priceType: msrp.priceType } : null,
        fitmentScore: score,
        fitmentCategory
      });
    }

    // Sort by fitmentScore desc
    results.sort((a, b) => (b.fitmentScore ?? 0) - (a.fitmentScore ?? 0));

    return {
      results,
      totalCount: raw.totalCount ?? results.length,
      page: safePage,
      pageSize: limit,
      fitment: {
        boltPattern,
        centerBoreMm,
        wheelDiameterRangeIn: [diaMin, diaMax],
        wheelWidthRangeIn: [widthMin, widthMax],
        offsetRangeMm: [offMin, offMax]
      }
    };
  }

  /**
   * @param {{db: import('pg').Pool, wheelAdapter: any}} deps
   */
  constructor({ db, wheelAdapter, tireSizeService }) {
    this.db = db;
    this.wheelAdapter = wheelAdapter;
    this.tireSizeService = tireSizeService;
  }

  async searchTires(query) {
    const raw = await this.wheelAdapter.searchTires(query);
    const results = raw.results || raw.searchResults || [];

    const out = [];
    for (const r of results) {
      const p = r?.properties || {};
      const inv = r?.inventory || {};
      const prices = r?.prices || {};

      const msrp = Array.isArray(prices?.msrp) ? prices.msrp[0] : null;
      const msrpAmount = msrp?.currencyAmount != null ? Number(msrp.currencyAmount) : null;

      out.push({
        sku: r.sku,
        title: r.title || null,
        brand: r.brand?.description || r.brand?.parent || r.brand || null,
        size: p.size || p.tire || p.tire_full || null,
        wheelDiameter: p.wheelDiameter != null ? Number(p.wheelDiameter) : null,
        width: p.width != null ? Number(p.width) : null,
        aspectRatio: p.aspectRatio != null ? Number(p.aspectRatio) : null,
        stock: {
          local: inv.localStock ?? null,
          global: inv.globalStock ?? null,
          type: inv.type ?? null
        },
        msrp: msrpAmount != null ? { amount: msrpAmount, currency: msrp?.currencyCode || 'USD', priceType: 'msrp' } : null,
        raw: r
      });
    }

    return {
      results: out,
      totalCount: raw.totalCount,
      page: raw.page,
      pageSize: raw.pageSize
    };
  }

  async getWheelDetails(externalSku) {
    if (!externalSku) {
      const err = new Error('sku_required');
      err.status = 400;
      throw err;
    }

    const rec = await this.wheelAdapter.getWheelDetails(externalSku);
    const spec = this.wheelAdapter.toWheelSpec(rec);
    const inv = this.wheelAdapter.toInventory(rec);
    const msrp = this.wheelAdapter.extractMsrp ? this.wheelAdapter.extractMsrp(rec) : null;

    const primaryImage = Array.isArray(rec?.images) && rec.images.length
      ? (rec.images.find((i) => String(i.aspect || '').toLowerCase() === 'standard') || rec.images[0])
      : null;

    return {
      sku: externalSku,
      title: rec?.title || null,
      brand: rec?.brand?.description || rec?.brand?.parent || rec?.brand || null,
      style: spec.model || rec?.properties?.model || null,
      diameter: spec.diameterIn,
      width: spec.widthIn,
      offset: spec.offsetMm,
      finish: spec.finish,
      boltPattern: spec.boltPattern,
      centerBoreMm: spec.centerBoreMm,
      primaryImage: primaryImage?.imageUrlLarge || primaryImage?.imageUrlMedium || primaryImage?.imageUrlSmall || primaryImage?.imageUrlOriginal || null,
      images: Array.isArray(rec?.images) ? rec.images : [],
      inventory: {
        local: inv.localStock ?? null,
        global: inv.globalStock ?? null,
        type: inv.inventoryType ?? null
      },
      msrp: msrp ? { amount: msrp.amount, currency: msrp.currency, priceType: msrp.priceType } : null
    };
  }

  async searchWheels(query) {
    const raw = await this.wheelAdapter.searchWheels(query);

    const results = raw.results || raw.searchResults || [];

    const supplierCode = this.wheelAdapter.getCapabilities().code;
    const supplierId = await this._getOrCreateSupplierId(supplierCode, 'wheel');

    const includeRaw = query?.includeRaw === true || query?.includeRaw === 'true';
    const debugPrice = query?.debugPrice === true || query?.debugPrice === 'true';

    const cards = [];
    const enriched = [];

    // Optional: populate MSRP from WheelPros Pricing API.
    // Disabled by default because pricing access may not be provisioned for the account.
    const enrichPricing = query?.enrichPricing === true || query?.enrichPricing === 'true';

    let msrpBySku = new Map();
    if (enrichPricing && this.wheelAdapter.getMsrpBySku) {
      try {
        const skus = results.map((r) => r?.sku).filter(Boolean);
        msrpBySku = await this.wheelAdapter.getMsrpBySku(skus, {
          company: query?.company,
          customer: query?.customer,
          currency: query?.currencyCode
        });
      } catch (e) {
        // Pricing should never break search.
        console.warn('[wheelpros][pricing] enrichment failed:', e?.response?.status, e?.response?.data || e?.message);
      }
    }

    for (const r of results) {
      const identity = await this._resolveIdentity({ supplierId, supplierCode, externalSku: r.sku, skuType: 'wheel' });

      // Persist structured specs + snapshots
      await this._upsertWheelStructured({ supplierId, identity, wheelRecord: r, debugPrice });

      const spec = this.wheelAdapter.toWheelSpec(r);
      const inv = this.wheelAdapter.toInventory(r);
      const msrp = msrpBySku.get(identity.externalSku)
        || (this.wheelAdapter.extractMsrp ? this.wheelAdapter.extractMsrp(r) : null);

      const primaryImage = Array.isArray(r.images) && r.images.length
        ? (r.images.find((i) => String(i.aspect || '').toLowerCase() === 'standard') || r.images[0])
        : null;

      const card = {
        sku: identity.externalSku,
        internalProductId: identity.internalProductId,
        title: r.title || null,
        brand: r.brand?.description || r.brand?.parent || r.brand || null,
        diameter: spec.diameterIn,
        width: spec.widthIn,
        offset: spec.offsetMm,
        boltPattern: spec.boltPattern,
        finish: spec.finish,
        centerBore: spec.centerBoreMm,
        stock: {
          local: inv.localStock,
          global: inv.globalStock,
          type: inv.inventoryType
        },
        primaryImage: primaryImage?.imageUrlLarge || primaryImage?.imageUrlMedium || primaryImage?.imageUrlSmall || primaryImage?.imageUrlOriginal || null,
        msrp: msrp ? { amount: msrp.amount, currency: msrp.currency, priceType: msrp.priceType } : null
      };

      cards.push(card);

      if (includeRaw) {
        enriched.push({
          identity,
          wheel: card,
          raw: {
            title: r.title,
            brand: r.brand,
            properties: r.properties,
            inventory: r.inventory,
            prices: r.prices,
            images: r.images
          }
        });
      }
    }

    return {
      results: cards,
      // optional raw payload per-item for debugging/back-compat
      ...(includeRaw ? { items: enriched } : {}),
      totalCount: raw.totalCount,
      page: raw.page,
      pageSize: raw.pageSize
    };
  }

  async _upsertWheelStructured({ supplierId, identity, wheelRecord, debugPrice = false }) {
    // Update product core
    await this.db.query({
      text: `
        update product
        set
          preferred_supplier_id = $2::uuid,
          preferred_external_sku = $3,
          title = $4,
          brand = $5,
          model = $6,
          raw = $7::jsonb,
          updated_at = now()
        where id = $1::uuid
      `,
      values: [
        identity.internalProductId,
        supplierId,
        identity.externalSku,
        wheelRecord.title || null,
        wheelRecord.brand?.description || wheelRecord.brand || null,
        wheelRecord.properties?.model || null,
        JSON.stringify({ supplier: identity.supplier, externalSku: identity.externalSku, wheelRecord })
      ]
    });

    const spec = this.wheelAdapter.toWheelSpec(wheelRecord);

    await this.db.query({
      text: `
        insert into wheel_spec (
          product_id, diameter_in, width_in, offset_mm, bolt_pattern, center_bore_mm,
          finish, finish_code, model, tpms_compatible, load_rating_lbs,
          created_at, updated_at
        ) values (
          $1::uuid, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          now(), now()
        )
        on conflict (product_id) do update set
          diameter_in = excluded.diameter_in,
          width_in = excluded.width_in,
          offset_mm = excluded.offset_mm,
          bolt_pattern = excluded.bolt_pattern,
          center_bore_mm = excluded.center_bore_mm,
          finish = excluded.finish,
          finish_code = excluded.finish_code,
          model = excluded.model,
          tpms_compatible = excluded.tpms_compatible,
          load_rating_lbs = excluded.load_rating_lbs,
          updated_at = now()
      `,
      values: [
        identity.internalProductId,
        spec.diameterIn,
        spec.widthIn,
        spec.offsetMm,
        spec.boltPattern,
        spec.centerBoreMm,
        spec.finish,
        spec.finishCode,
        spec.model,
        spec.tpmsCompatible,
        spec.loadRatingLbs
      ]
    });

    const inv = this.wheelAdapter.toInventory(wheelRecord);
    // Prevent DB bloat: avoid inserting identical inventory snapshots too frequently.
    await this.db.query({
      text: `
        insert into product_inventory (
          id, product_id, local_stock, global_stock, inventory_type,
          supplier_id, source_timestamp, confidence, as_of
        )
        select $1::uuid, $2::uuid, $3, $4, $5,
               $6::uuid, now(), $7, now()
        where not exists (
          select 1
          from product_inventory pi
          where pi.product_id = $2::uuid
            and pi.supplier_id = $6::uuid
            and pi.local_stock is not distinct from $3
            and pi.global_stock is not distinct from $4
            and pi.inventory_type is not distinct from $5
            and pi.as_of > now() - interval '1 hour'
        )
      `,
      values: [
        randomUUID(),
        identity.internalProductId,
        inv.localStock,
        inv.globalStock,
        inv.inventoryType,
        supplierId,
        null
      ]
    });

    const prices = this.wheelAdapter.toPrices(wheelRecord);

    if (debugPrice) {
      const msrp = this.wheelAdapter.extractMsrp ? this.wheelAdapter.extractMsrp(wheelRecord) : null;
      console.log('[wheelpros][price]', {
        sku: identity.externalSku,
        hasPrices: !!wheelRecord?.prices,
        priceKeys: wheelRecord?.prices ? Object.keys(wheelRecord.prices) : null,
        extractedMsrp: msrp,
        rawMsrp: wheelRecord?.prices?.msrp?.[0] || null
      });
    }

    // Prevent DB bloat: only insert when we have a real amount and we haven't inserted the same
    // (product, type, currency, amount) recently.
    for (const p of prices) {
      await this.db.query({
        text: `
          insert into product_price (id, product_id, price_type, currency, amount, as_of)
          select $1::uuid, $2::uuid, $3, $4, $5::numeric(12,2), now()
          where $5::numeric(12,2) is not null
            and not exists (
              select 1
              from product_price pp
              where pp.product_id = $2::uuid
                and pp.price_type = $3
                and pp.currency = $4
                and pp.amount = $5::numeric(12,2)
                and pp.as_of > now() - interval '6 hours'
            )
        `,
        values: [randomUUID(), identity.internalProductId, p.priceType, p.currency, p.amount]
      });
    }
  }

  async _resolveIdentity({ supplierId, supplierCode, externalSku, skuType }) {
    const { rows } = await this.db.query({
      text: `select internal_product_id from supplier_product_map where supplier_id = $1::uuid and supplier_sku = $2`,
      values: [supplierId, externalSku]
    });

    let internalProductId = rows[0]?.internal_product_id;

    if (!internalProductId) {
      internalProductId = randomUUID();

      // Create product row
      await this.db.query({
        text: `insert into product (id, internal_sku, sku_type, preferred_supplier_id, preferred_external_sku, raw) values ($1::uuid, $2, $3, $4::uuid, $5, $6::jsonb)`,
        values: [internalProductId, null, skuType, supplierId, externalSku, JSON.stringify({ createdFrom: 'wheel-search', supplierCode })]
      });

      await this.db.query({
        text: `insert into supplier_product_map (id, supplier_id, supplier_sku, internal_product_id, sku_type) values ($1::uuid, $2::uuid, $3, $4::uuid, $5)`,
        values: [randomUUID(), supplierId, externalSku, internalProductId, skuType]
      });
    }

    return { supplier: supplierCode, externalSku, internalProductId };
  }

  async _getOrCreateSupplierId(code, kind) {
    const found = await this.db.query({
      text: `select id from supplier where code = $1`,
      values: [code]
    });
    if (found.rows[0]) return found.rows[0].id;

    const id = randomUUID();
    await this.db.query({
      text: `insert into supplier (id, code, name, kind) values ($1::uuid, $2, $3, $4)`,
      values: [id, code, code, kind]
    });
    return id;
  }
}

function pickOem(min, max) {
  const a = min != null ? Number(min) : null;
  const b = max != null ? Number(max) : null;
  if (a == null && b == null) return null;
  if (a != null && b == null) return a;
  if (a == null && b != null) return b;
  if (a === b) return a;
  return (a + b) / 2;
}

module.exports = { WheelService };
