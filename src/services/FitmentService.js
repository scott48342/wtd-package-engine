const { randomUUID } = require('crypto');

class FitmentService {
  /**
   * @param {{db: import('pg').Pool, provider: any, cacheTtlDays?:number}} deps
   */
  constructor({ db, provider, cacheTtlDays = 7 }) {
    this.db = db;
    this.provider = provider;
    this.cacheTtlDays = cacheTtlDays;
  }

  /**
   * Get fitment for a vehicle. Uses cache if present, otherwise calls provider.
   * Returns normalized output contract.
   */
  async getFitmentForVehicle(vehicle) {
    // Ensure vehicle row exists (service may be called with an in-memory vehicle object)
    await this._upsertVehicle(vehicle);

    // 1) check cache (with TTL)
    const cached = await this._getCachedFitment(vehicle.id);
    if (cached && isFresh(cached?.source?.asOf, this.cacheTtlDays)) return cached;

    // 2) resolve via provider
    const fitment = await this.provider.getFitment({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      submodel: vehicle.submodel,
      trim: vehicle.trim
    });

    // 3) persist normalized fitment + source
    await this._upsertFitment(vehicle.id, fitment, {
      provider: this.provider.getCapabilities().code,
      sourceRecordTimestamp: fitment?.sourceRecordTimestamp || null,
      confidence: fitment?.confidence ?? null,
      quality: fitment?.quality || null
    });

    return await this._getCachedFitment(vehicle.id);
  }

  /**
   * Creates/updates vehicle row.
   * Requires `vehicle.id` to be present.
   *
   * NOTE: This means a fitment lookup is not read-only; it may upsert vehicle records.
   * TODO: consider a uniqueness constraint + resolver for (year, make, model, submodel, trim)
   * to prevent duplicate vehicle identities if multiple UUIDs represent the same Y/M/M.
   */
  async _upsertVehicle(vehicle) {
    if (!vehicle?.id) throw new Error('FitmentService requires vehicle.id');
    await this.db.query({
      text: `
        insert into vehicle (id, year, make, model, submodel, trim)
        values ($1::uuid, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          year = excluded.year,
          make = excluded.make,
          model = excluded.model,
          submodel = excluded.submodel,
          trim = excluded.trim
      `,
      values: [
        vehicle.id,
        vehicle.year,
        vehicle.make,
        vehicle.model,
        vehicle.submodel || null,
        vehicle.trim || null
      ]
    });
  }

  async _getCachedFitment(vehicleId) {
    const q = {
      text: `
        select vf.id as vehicle_fitment_id, vf.vehicle_id, vf.bolt_pattern, vf.center_bore_mm,
               vf.min_offset_mm, vf.max_offset_mm, vf.min_wheel_dia_in, vf.max_wheel_dia_in,
               vf.min_wheel_w_in, vf.max_wheel_w_in,
               vfs.provider, vfs.as_of as source_as_of, vfs.source_record_timestamp, vfs.confidence as source_confidence, vfs.quality
        from vehicle_fitment vf
        left join vehicle_fitment_source vfs on vfs.vehicle_fitment_id = vf.id
        where vf.vehicle_id = $1::uuid
        limit 1
      `,
      values: [vehicleId]
    };
    const { rows } = await this.db.query(q);
    if (!rows[0]) return null;

    const row = rows[0];

    // OEM tire sizes
    const { rows: oemRows } = await this.db.query({
      text: `select size from vehicle_oem_tire_size where vehicle_id = $1::uuid order by size asc`,
      values: [vehicleId]
    });

    let notes = {};
    try {
      notes = row.notes ? JSON.parse(row.notes) : {};
    } catch {
      notes = {};
    }

    return {
      vehicleId: row.vehicle_id,
      fitment: {
        boltPattern: row.bolt_pattern,
        centerBoreMm: row.center_bore_mm != null ? Number(row.center_bore_mm) : null,
        wheelDiameterRangeIn: [
          row.min_wheel_dia_in != null ? Number(row.min_wheel_dia_in) : null,
          row.max_wheel_dia_in != null ? Number(row.max_wheel_dia_in) : null
        ],
        wheelWidthRangeIn: [
          row.min_wheel_w_in != null ? Number(row.min_wheel_w_in) : null,
          row.max_wheel_w_in != null ? Number(row.max_wheel_w_in) : null
        ],
        offsetRangeMm: [
          row.min_offset_mm != null ? Number(row.min_offset_mm) : null,
          row.max_offset_mm != null ? Number(row.max_offset_mm) : null
        ],
        wheelSizes: Array.isArray(notes.wheelSizes) ? notes.wheelSizes : [],
        oemTireSizes: oemRows.map(r => r.size)
      },
      source: {
        provider: row.provider || null,
        asOf: row.source_as_of || null,
        sourceRecordTimestamp: row.source_record_timestamp || null,
        confidence: row.source_confidence != null ? Number(row.source_confidence) : null,
        quality: row.quality || null
      }
    };
  }

  async _upsertFitment(vehicleId, fitment, source) {
    // NOTE: this assumes the provider returns normalized fields. If not, normalize here.
    // This is still safe: package engine only sees what we persist.

    // Upsert vehicle_fitment (unique vehicle_id)
    const fitmentId = randomUUID();
    await this.db.query({
      text: `
        insert into vehicle_fitment (
          id, vehicle_id, bolt_pattern, center_bore_mm,
          min_offset_mm, max_offset_mm,
          min_wheel_dia_in, max_wheel_dia_in,
          min_wheel_w_in, max_wheel_w_in,
          notes
        ) values (
          $1::uuid, $2::uuid, $3, $4,
          $5, $6,
          $7, $8,
          $9, $10,
          $11
        )
        on conflict (vehicle_id) do update set
          bolt_pattern = excluded.bolt_pattern,
          center_bore_mm = excluded.center_bore_mm,
          min_offset_mm = excluded.min_offset_mm,
          max_offset_mm = excluded.max_offset_mm,
          min_wheel_dia_in = excluded.min_wheel_dia_in,
          max_wheel_dia_in = excluded.max_wheel_dia_in,
          min_wheel_w_in = excluded.min_wheel_w_in,
          max_wheel_w_in = excluded.max_wheel_w_in
        returning id
      `,
      values: [
        fitmentId,
        vehicleId,
        fitment.boltPattern || null,
        fitment.centerBoreMm ?? null,
        fitment.offsetRangeMm?.[0] ?? null,
        fitment.offsetRangeMm?.[1] ?? null,
        fitment.wheelDiameterRangeIn?.[0] ?? null,
        fitment.wheelDiameterRangeIn?.[1] ?? null,
        fitment.wheelWidthRangeIn?.[0] ?? null,
        fitment.wheelWidthRangeIn?.[1] ?? null,
        // Store JSON for richer cached response (wheelSizes, etc.)
        JSON.stringify({
          wheelSizes: fitment.wheelSizes || [],
          oemTireSizes: fitment.oemTireSizes || []
        })
      ]
    });

    // Find vehicle_fitment id for source insert
    const { rows } = await this.db.query({
      text: `select id from vehicle_fitment where vehicle_id = $1::uuid`,
      values: [vehicleId]
    });
    const vfId = rows[0]?.id;
    if (!vfId) return;

    await this.db.query({
      text: `
        insert into vehicle_fitment_source (
          id, vehicle_fitment_id, provider, source_record_timestamp, as_of, confidence, quality
        ) values (
          $1::uuid, $2::uuid, $3, $4, now(), $5, $6
        )
        on conflict (vehicle_fitment_id, provider) do update set
          source_record_timestamp = excluded.source_record_timestamp,
          as_of = excluded.as_of,
          confidence = excluded.confidence,
          quality = excluded.quality
      `,
      values: [randomUUID(), vfId, source.provider, source.sourceRecordTimestamp, source.confidence, source.quality]
    });

    // OEM tire sizes (refresh list)
    const sizes = Array.from(new Set((fitment?.oemTireSizes || [])
      .map(normalizeOemTireSize)
      .filter(Boolean)));
    if (sizes.length) {
      await this.db.query({
        text: `delete from vehicle_oem_tire_size where vehicle_id = $1::uuid`,
        values: [vehicleId]
      });
      for (const s of sizes) {
        await this.db.query({
          text: `insert into vehicle_oem_tire_size (id, vehicle_id, size, position) values ($1::uuid, $2::uuid, $3, $4)`,
          values: [randomUUID(), vehicleId, s, 'all']
        });
      }
    }
  }
}

function normalizeOemTireSize(v) {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  const m = s.match(/(\d{3}\/\d{2,3}R\d{2}(?:\.\d)?)/i);
  return (m ? m[1] : s) || null;
}

function isFresh(asOf, ttlDays) {
  if (!asOf) return false;
  const t = new Date(asOf).getTime();
  if (!Number.isFinite(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs >= 0 && ageMs <= (ttlDays * 24 * 60 * 60 * 1000);
}

module.exports = { FitmentService };
