class VehicleService {
  /**
   * @param {{db: import('pg').Pool}} deps
   */
  constructor({ db }) {
    this.db = db;
  }

  async listMakes({ year }) {
    const q = {
      text: `select distinct make from vehicle where ($1::int is null or year = $1) order by make asc`,
      values: [year ?? null]
    };
    const { rows } = await this.db.query(q);
    return rows.map(r => r.make);
  }

  async listModels({ year, make }) {
    const q = {
      text: `select distinct model from vehicle where ($1::int is null or year = $1) and ($2::text is null or make = $2) order by model asc`,
      values: [year ?? null, make ?? null]
    };
    const { rows } = await this.db.query(q);
    return rows.map(r => r.model);
  }

  async getVehicleById(vehicleId) {
    const { rows } = await this.db.query({
      text: `select id, year, make, model, submodel, trim from vehicle where id = $1::uuid`,
      values: [vehicleId]
    });
    return rows[0] || null;
  }

  async getOrCreateVehicleModification({ vehicleId, modification, trim }) {
    if (!vehicleId) throw new Error('vehicleId_required');
    if (!modification) throw new Error('modification_required');

    const { rows } = await this.db.query({
      text: `
        select id, vehicle_id, modification, trim
        from vehicle_modification
        where vehicle_id = $1::uuid
          and modification = $2
        limit 1
      `,
      values: [vehicleId, String(modification)]
    });

    if (rows[0]) return rows[0];

    const id = require('crypto').randomUUID();
    await this.db.query({
      text: `insert into vehicle_modification (id, vehicle_id, modification, trim) values ($1::uuid, $2::uuid, $3, $4)`,
      values: [id, vehicleId, String(modification), trim ? String(trim) : null]
    });

    return { id, vehicle_id: vehicleId, modification: String(modification), trim: trim ? String(trim) : null };
  }

  /**
   * Find or create a vehicle identity for a year/make/model lookup.
   * Uses a best-effort match on (year, make, model) with null submodel/trim.
   */
  async getOrCreateVehicle({ year, make, model }) {
    const { rows } = await this.db.query({
      text: `
        select id, year, make, model, submodel, trim
        from vehicle
        where year = $1
          and lower(make) = lower($2)
          and lower(model) = lower($3)
          and submodel is null
          and trim is null
        order by created_at asc
        limit 1
      `,
      values: [year, make, model]
    });

    if (rows[0]) return rows[0];

    const id = require('crypto').randomUUID();
    await this.db.query({
      text: `insert into vehicle (id, year, make, model, submodel, trim) values ($1::uuid, $2, $3, $4, null, null)`,
      values: [id, year, make, model]
    });

    return { id, year, make, model, submodel: null, trim: null };
  }
}

module.exports = { VehicleService };
