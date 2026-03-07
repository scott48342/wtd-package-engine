const { randomUUID } = require('crypto');

class WheelService {
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

    const normalized = [];
    for (const r of results) {
      const identity = await this._resolveIdentity({ supplierId, supplierCode, externalSku: r.sku, skuType: 'wheel' });

      // Persist structured specs + snapshots
      await this._upsertWheelStructured({ supplierId, identity, wheelRecord: r });

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

  async _upsertWheelStructured({ supplierId, identity, wheelRecord }) {
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
        inv.localStock,
        inv.globalStock,
        inv.inventoryType,
        supplierId,
        null
      ]
    });

    const prices = this.wheelAdapter.toPrices(wheelRecord);
    for (const p of prices) {
      await this.db.query({
        text: `
          insert into product_price (
            id, product_id, price_type, currency, amount, as_of
          ) values (
            $1::uuid, $2::uuid, $3, $4, $5, now()
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
