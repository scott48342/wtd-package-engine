const { randomUUID } = require('crypto');

class TireService {
  /**
   * @param {{db: import('pg').Pool, tireAdapter: any, tireSizeService: any}} deps
   */
  constructor({ db, tireAdapter, tireSizeService }) {
    this.db = db;
    this.tireAdapter = tireAdapter;
    this.tireSizeService = tireSizeService;
  }

  async searchTires(query) {
    if (!this.tireAdapter) {
      return { results: [], totalCount: 0, page: 1, pageSize: 0, note: 'No tire adapter configured yet' };
    }

    const raw = await this.tireAdapter.searchTires(query);
    const results = raw.results || raw.searchResults || [];

    const supplierCode = this.tireAdapter.getCapabilities().code;
    const supplierId = await this._getOrCreateSupplierId(supplierCode, 'tire');

    const normalized = [];
    for (const r of results) {
      const identity = await this._resolveIdentity({ supplierId, supplierCode, externalSku: r.sku, skuType: 'tire' });
      await this._upsertTireStructured({ supplierId, identity, tireRecord: r });

      normalized.push({
        identity,
        title: r.title,
        brand: r.brand,
        properties: r.properties,
        inventory: r.inventory,
        prices: r.prices,
        images: r.images
      });
    }

    return {
      results: normalized,
      totalCount: raw.totalCount,
      page: raw.page,
      pageSize: raw.pageSize
    };
  }

  async _upsertTireStructured({ supplierId, identity, tireRecord }) {
    const sizeStr = tireRecord?.properties?.size || tireRecord?.size || null;
    const tireSizeId = sizeStr ? await this.tireSizeService.upsertTireSize(this.db, sizeStr) : null;

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
        tireRecord.title || null,
        tireRecord.brand?.description || tireRecord.brand || null,
        tireRecord.model || tireRecord.properties?.model || null,
        JSON.stringify({ supplier: identity.supplier, externalSku: identity.externalSku, tireRecord })
      ]
    });

    // Tire spec
    const parsed = this.tireSizeService.parseSize(sizeStr);

    await this.db.query({
      text: `
        insert into tire_spec (
          product_id, tire_size_id, size,
          width_mm, aspect_ratio, wheel_diameter_in,
          model, season, load_index, speed_rating, run_flat,
          created_at, updated_at
        ) values (
          $1::uuid, $2::uuid, $3,
          $4, $5, $6,
          $7, $8, $9, $10, $11,
          now(), now()
        )
        on conflict (product_id) do update set
          tire_size_id = excluded.tire_size_id,
          size = excluded.size,
          width_mm = excluded.width_mm,
          aspect_ratio = excluded.aspect_ratio,
          wheel_diameter_in = excluded.wheel_diameter_in,
          model = excluded.model,
          season = excluded.season,
          load_index = excluded.load_index,
          speed_rating = excluded.speed_rating,
          run_flat = excluded.run_flat,
          updated_at = now()
      `,
      values: [
        identity.internalProductId,
        tireSizeId,
        parsed?.size || sizeStr,
        parsed?.widthMm ?? null,
        parsed?.aspectRatio ?? null,
        parsed?.wheelDiameterIn ?? null,
        tireRecord.properties?.model || tireRecord.model || null,
        tireRecord.properties?.season || null,
        tireRecord.properties?.loadIndex ?? null,
        tireRecord.properties?.speedRating || null,
        tireRecord.properties?.runFlat ?? null
      ]
    });

    // Inventory snapshot
    const inv = tireRecord?.inventory || {};
    await this.db.query({
      text: `
        insert into product_inventory (
          id, product_id, local_stock, global_stock, inventory_type,
          supplier_id, source_timestamp, confidence, as_of
        ) values (
          $1::uuid, $2::uuid, $3, $4, $5,
          $6::uuid, now(), $7, now()
        )
      `,
      values: [
        randomUUID(),
        identity.internalProductId,
        inv.localStock ?? null,
        inv.globalStock ?? null,
        inv.type ?? null,
        supplierId,
        null
      ]
    });

    // Price snapshot(s)
    const prices = tireRecord?.prices || {};
    for (const [priceType, arr] of Object.entries(prices)) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        const amount = p?.currencyAmount != null ? Number(String(p.currencyAmount)) : null;
        const currency = p?.currencyCode || 'USD';
        if (!Number.isFinite(amount)) continue;
        await this.db.query({
          text: `
            insert into product_price (
              id, product_id, price_type, currency, amount, as_of
            ) values (
              $1::uuid, $2::uuid, $3, $4, $5, now()
            )
          `,
          values: [randomUUID(), identity.internalProductId, priceType, currency, amount]
        });
      }
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
      await this.db.query({
        text: `insert into product (id, internal_sku, sku_type, preferred_supplier_id, preferred_external_sku, raw) values ($1::uuid, $2, $3, $4::uuid, $5, $6::jsonb)`,
        values: [internalProductId, null, skuType, supplierId, externalSku, JSON.stringify({ createdFrom: 'tire-search', supplierCode })]
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

module.exports = { TireService };

