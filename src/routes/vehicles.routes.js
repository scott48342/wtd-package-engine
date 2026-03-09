const express = require('express');

function vehiclesRouter({ vehicleService, fitmentService }) {
  const r = express.Router();

  // Vehicle lookup (Y/M/M) via Wheel-Size, with DB persistence + cache.
  r.get('/search', async (req, res, next) => {
    try {
      const year = req.query.year ? Number(req.query.year) : null;
      const make = req.query.make ? String(req.query.make).trim() : null;
      const model = req.query.model ? String(req.query.model).trim() : null;

      if (!year || !Number.isFinite(year)) return res.status(400).json({ error: 'year_required' });
      if (!make) return res.status(400).json({ error: 'make_required' });
      if (!model) return res.status(400).json({ error: 'model_required' });

      // Resolve/create a vehicle identity for this Y/M/M.
      const vehicle = await vehicleService.getOrCreateVehicle({ year, make, model });

      // Fetch fitment (cached + persisted).
      const data = await fitmentService.getFitmentForVehicle(vehicle);

      const bp = data?.fitment?.boltPattern || null;
      const lugCount = bp ? parseLugCount(bp) : null;

      res.json({
        vehicle: { id: vehicle.id, year: vehicle.year, make: vehicle.make, model: vehicle.model },
        boltPattern: bp,
        lugCount,
        centerBoreMm: data?.fitment?.centerBoreMm ?? null,
        wheelSizes: data?.fitment?.wheelSizes || [],
        tireSizes: data?.fitment?.oemTireSizes || []
      });
    } catch (e) {
      next(e);
    }
  });

  r.get('/makes', async (req, res, next) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const makes = await vehicleService.listMakes({ year });
      res.json({ results: makes });
    } catch (e) {
      next(e);
    }
  });

  r.get('/models', async (req, res, next) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const make = req.query.make ? String(req.query.make) : undefined;
      const models = await vehicleService.listModels({ year, make });
      res.json({ results: models });
    } catch (e) {
      next(e);
    }
  });

  r.get('/:vehicleId/fitment', async (req, res, next) => {
    try {
      const vehicleId = req.params.vehicleId;
      const vehicle = await vehicleService.getVehicleById(vehicleId);
      if (!vehicle) return res.status(404).json({ error: 'vehicle_not_found' });

      const data = await fitmentService.getFitmentForVehicle(vehicle);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  return r;
}

function parseLugCount(boltPattern) {
  // e.g. "5x114.3" → 5
  const m = String(boltPattern || '').match(/^(\d+)\s*x/i);
  return m ? Number(m[1]) : null;
}

module.exports = { vehiclesRouter };
