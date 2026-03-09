const { randomUUID } = require('crypto');

class WheelService {
  async listCompatibleWheels({ vehicleId, page = 1, pageSize = 20 }) {
    // 1) Load vehicle fitment
    const { rows } = await this.db.query({
      text: `
        select bolt_pattern, center_bore_mm,
               min_wheel_dia_in, max_wheel_dia_in,
               min_wheel_w_in, max_wheel_w_in,
               min_offset_mm, max_offset_mm
        from vehicle_fitment
        where vehicle_id = $1::uuid
        limit 1
      `,
      values: [vehicleId]
    });

    const f = rows[0];
    if (!f) {
      return { results: [], totalCount: 0, page, pageSize, error: 'vehicle_fitment_not_found' };
    }

    const boltPattern = (f.bolt_pattern || '').trim();
    const centerBoreMm = f.center_bore_mm != null ? Number(f.center_bore_mm) : null;

    const diaMin = f.min_wheel_dia_in != null ? Number(f.min_wheel_dia_in) : null;
    const diaMax = f.max_wheel_dia_in != null ? Number(f.max_wheel_dia_in) : null;
    const widthMin = f.min_wheel_w_in != null ? Number(f.min_wheel_w_in) : null;
    const widthMax = f.max_wheel_w_in != null ? Number(f.max_wheel_w_in) : null;
    const offMin = f.min_offset_mm != null ? Number(f.min_offset_mm) : null;
    const offMax = f.max_offset_mm != null ? Number(f.max_offset_mm) : null;

    // Compatibility tolerances
    const widthTol = 1; // ±1 inch
    const offsetTol = 10; // ±10 mm

    // 2) Query compatible wheels from catalog (DB)
    // NOTE: Current WheelPros ingestion often has empty boltPattern; this will limit matches.
    const where = [];
    const values = [];
    let i = 1;

    where.push(`p.sku_type = 'wheel'`);

    if (boltPattern) {
      values.push(boltPattern);
      // normalize comparison
      where.push(`lower(ws.bolt_pattern) = lower($${i++})`);
    }

    if (centerBoreMm != null) {
      values.push(centerBoreMm);
      // require present and >= vehicle
      where.push(`ws.center_bore_mm >= $${i++}::numeric(6,2)`);
    }

    // diameter: require present and within range
    if (diaMin != null) {
      values.push(diaMin);
      where.push(`ws.diameter_in >= $${i++}::numeric(5,2)`);
    }
    if (diaMax != null) {
      values.push(diaMax);
      where.push(`ws.diameter_in <= $${i++}::numeric(5,2)`);
    }

    // width: allow ± tolerance
    if (widthMin != null) {
      values.push(widthMin - widthTol);
      where.push(`ws.width_in >= $${i++}::numeric(5,2)`);
    }
    if (widthMax != null) {
      values.push(widthMax + widthTol);
      where.push(`ws.width_in <= $${i++}::numeric(5,2)`);
    }

    // offset: allow ± tolerance
    if (offMin != null) {
      values.push(offMin - offsetTol);
      where.push(`ws.offset_mm >= $${i++}::numeric(6,2)`);
    }
    if (offMax != null) {
      values.push(offMax + offsetTol);
      where.push(`ws.offset_mm <= $${i++}::numeric(6,2)`);
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const countQ = {
      text: `
        select count(*)::int as c
        from product p
        join wheel_spec ws on ws.product_id = p.id
        ${whereSql}
      `,
      values
    };

    const { rows: countRows } = await this.db.query(countQ);
    const totalCount = countRows[0]?.c || 0;

    const limit = Math.max(1, Math.min(100, Number(pageSize) || 20));
    const offset = (Math.max(1, Number(page) || 1) - 1) * limit;

    const q = {
      text: `
        select
          p.id as internal_product_id,
          p.preferred_external_sku as sku,
          p.title,
          p.brand,
          ws.diameter_in,
          ws.width_in,
          ws.offset_mm,
          ws.finish,
          ws.bolt_pattern,
          ws.center_bore_mm,
          (
            select pi.global_stock
            from product_inventory pi
            where pi.product_id = p.id
            order by pi.as_of desc
            limit 1
          ) as global_stock,
          (
            select pi.local_stock
            from product_inventory pi
            where pi.product_id = p.id
            order by pi.as_of desc
            limit 1
          ) as local_stock,
          (
            select pp.amount
            from product_price pp
            where pp.product_id = p.id and pp.price_type = 'msrp'
            order by pp.as_of desc
            limit 1
          ) as msrp_amount,
          (
            select pp.currency
            from product_price pp
            where pp.product_id = p.id and pp.price_type = 'msrp'
            order by pp.as_of desc
            limit 1
          ) as msrp_currency
        from product p
        join wheel_spec ws on ws.product_id = p.id
        ${whereSql}
        order by p.updated_at desc
        limit ${limit} offset ${offset}
      `,
      values
    };

    const { rows: wheelRows } = await this.db.query(q);

    const results = wheelRows.map((r) => ({
      sku: r.sku,
      title: r.title || null,
      brand: r.brand || null,
      diameter: r.diameter_in != null ? Number(r.diameter_in) : null,
      width: r.width_in != null ? Number(r.width_in) : null,
      offset: r.offset_mm != null ? Number(r.offset_mm) : null,
      finish: r.finish || null,
      primaryImage: null, // not stored in DB yet
      stock: {
        local: r.local_stock != null ? Number(r.local_stock) : null,
        global: r.global_stock != null ? Number(r.global_stock) : null
      },
      msrp: r.msrp_amount != null ? { amount: Number(r.msrp_amount), currency: r.msrp_currency || 'USD', priceType: 'msrp' } : null
    }));

    return { results, totalCount, page, pageSize, fitment: { boltPattern, centerBoreMm, wheelDiameterRangeIn: [diaMin, diaMax], wheelWidthRangeIn: [widthMin, widthMax], offsetRangeMm: [offMin, offMax] } };
  }

  /**
   * @param {{db: import('pg').Pool, wheelAdapter: any}} deps
   */
  constructor({ db, wheelAdapter, tireSizeService }) {
    this.db = db;
    this.wheelAdapter = wheelAdapter;
    this.tireSizeService = tireSizeService;
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

module.exports = { WheelService };
