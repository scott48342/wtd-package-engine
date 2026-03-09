const express = require('express');

function vehiclesRouter({ vehicleService, fitmentService, wheelService, wheelSizeCatalogService }) {
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

  r.get('/years', async (req, res, next) => {
    try {
      if (!wheelSizeCatalogService) return res.status(500).json({ error: 'wheel_size_not_configured' });
      const payload = await wheelSizeCatalogService.listYears();
      const years = Array.isArray(payload?.data) ? payload.data.map((y) => Number(y)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b) : [];
      res.json({ results: years });
    } catch (e) {
      next(e);
    }
  });

  // Makes (Wheel-Size API + DB cache)
  r.get('/makes', async (req, res, next) => {
    try {
      if (!wheelSizeCatalogService) return res.status(500).json({ error: 'wheel_size_not_configured' });
      const year = req.query.year ? Number(req.query.year) : null;
      if (!year || !Number.isFinite(year)) return res.status(400).json({ error: 'year_required' });

      const payload = await wheelSizeCatalogService.listMakes({ year });
      const makes = Array.isArray(payload?.data)
        ? payload.data.map((m) => m?.name || m?.name_en || m?.slug).filter(Boolean)
        : [];

      res.json({ results: makes });
    } catch (e) {
      next(e);
    }
  });

  // Models (Wheel-Size API + DB cache)
  r.get('/models', async (req, res, next) => {
    try {
      if (!wheelSizeCatalogService) return res.status(500).json({ error: 'wheel_size_not_configured' });
      const year = req.query.year ? Number(req.query.year) : null;
      const make = req.query.make ? String(req.query.make) : null;
      if (!year || !Number.isFinite(year)) return res.status(400).json({ error: 'year_required' });
      if (!make) return res.status(400).json({ error: 'make_required' });

      // Wheel-Size models endpoint requires make slug; we resolve like FitmentAdapter does.
      const makeSlug = make.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const payload = await wheelSizeCatalogService.listModels({ year, make: makeSlug });

      const models = Array.isArray(payload?.data)
        ? payload.data.map((m) => m?.name || m?.name_en || m?.slug).filter(Boolean)
        : [];

      res.json({ results: models });
    } catch (e) {
      next(e);
    }
  });

  r.get('/:vehicleId/wheels', async (req, res, next) => {
    try {
      if (!wheelService) return res.status(500).json({ error: 'wheel_service_not_configured' });
      const vehicleId = req.params.vehicleId;

      const page = req.query.page ? Number(req.query.page) : 1;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
      const targetDiameter = req.query.targetDiameter != null ? Number(req.query.targetDiameter) : null;

      const data = await wheelService.listCompatibleWheels({ vehicleId, page, pageSize, targetDiameter });
      res.json(data);
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
