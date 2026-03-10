const express = require('express');

function vehiclesRouter({ vehicleService, fitmentService, wheelService, wheelSizeCatalogService }) {
  const r = express.Router();

  // Vehicle lookup (Y/M/M) via Wheel-Size, with DB persistence + cache.
  // Optional: pass `modification` (Wheel-Size modification slug/id) for trim-specific fitment.
  r.get('/search', async (req, res, next) => {
    try {
      const year = req.query.year ? Number(req.query.year) : null;
      const make = req.query.make ? String(req.query.make).trim() : null;
      const model = req.query.model ? String(req.query.model).trim() : null;
      const modification = req.query.modification ? String(req.query.modification).trim() : null;
      const trim = req.query.trim ? String(req.query.trim).trim() : null;
      const trimLevel = req.query.trimLevel ? String(req.query.trimLevel).trim() : null;

      if (!year || !Number.isFinite(year)) return res.status(400).json({ error: 'year_required' });
      if (!make) return res.status(400).json({ error: 'make_required' });
      if (!model) return res.status(400).json({ error: 'model_required' });

      // Resolve/create a vehicle identity for this Y/M/M.
      const vehicle = await vehicleService.getOrCreateVehicle({ year, make, model });

      // If a trimLevel is provided without a modification, resolve the best Wheel-Size modification.
      let resolved = null;
      if (!modification && trimLevel) {
        resolved = await fitmentService.resolveModificationForTrimLevel({ year, make, model, trimLevel });
      }
      const effectiveModification = modification || resolved?.modification || null;
      const effectiveTrim = trim || resolved?.trim || null;

      // If a modification is provided (or resolved), bind it to this vehicle.
      const vehicleModification = effectiveModification
        ? await vehicleService.getOrCreateVehicleModification({ vehicleId: vehicle.id, modification: effectiveModification, trim: effectiveTrim })
        : null;

      // Fetch fitment (cached + persisted), scoped to modification when present.
      const data = await fitmentService.getFitmentForVehicle(vehicle, {
        vehicleModificationId: vehicleModification?.id || null,
        modification: effectiveModification || null,
        trim: effectiveTrim || null
      });

      const bp = data?.fitment?.boltPattern || null;
      const lugCount = bp ? parseLugCount(bp) : null;

      res.json({
        vehicle: { id: vehicle.id, year: vehicle.year, make: vehicle.make, model: vehicle.model },
        trim: vehicleModification?.trim || trim || null,
        modification: vehicleModification?.modification || modification || null,
        vehicleModificationId: vehicleModification?.id || null,
        boltPattern: bp,
        lugCount,
        centerBoreMm: data?.fitment?.centerBoreMm ?? null,
        wheelDiameterRangeIn: data?.fitment?.wheelDiameterRangeIn || [null, null],
        wheelWidthRangeIn: data?.fitment?.wheelWidthRangeIn || [null, null],
        offsetRangeMm: data?.fitment?.offsetRangeMm || [null, null],
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
      const years = Array.isArray(payload?.data)
        ? payload.data
          .map((y) => {
            if (typeof y === 'number' || typeof y === 'string') return Number(y);
            return Number(y?.slug ?? y?.name);
          })
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b)
        : [];
      res.json({ results: years });
    } catch (e) {
      next(e);
    }
  });

  // Trims/modifications (Wheel-Size)
  // NOTE: For many vehicles, Wheel-Size "modification" is engine/drive and contains trim_levels[]
  // (WT/LT/LTZ/etc). Our adapter expands those into user-facing trims.
  // GET /v1/vehicles/trims?year=2020&make=Chevrolet&model=Silverado%202500%20HD
  r.get('/trims', async (req, res, next) => {
    try {
      const year = req.query.year ? Number(req.query.year) : null;
      const make = req.query.make ? String(req.query.make).trim() : null;
      const model = req.query.model ? String(req.query.model).trim() : null;

      if (!year || !Number.isFinite(year)) return res.status(400).json({ error: 'year_required' });
      if (!make) return res.status(400).json({ error: 'make_required' });
      if (!model) return res.status(400).json({ error: 'model_required' });

      const results = await fitmentService.listTrims({ year, make, model });
      res.json({ results });
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
