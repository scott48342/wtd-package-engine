const express = require('express');
const { z } = require('zod');

const RecommendSchema = z.object({
  vehicleId: z.string().uuid(),
  preferences: z.record(z.any()).optional()
});

function packagesRouter({ packageEngineService }) {
  const r = express.Router();

  r.get('/plus-size', async (req, res, next) => {
    try {
      const vehicleId = req.query.vehicleId ? String(req.query.vehicleId) : null;
      const targetDiameter = req.query.targetDiameter != null ? Number(req.query.targetDiameter) : null;

      if (!vehicleId) return res.status(400).json({ error: 'vehicleId_required' });
      if (!targetDiameter || !Number.isFinite(targetDiameter)) return res.status(400).json({ error: 'targetDiameter_required' });

      const tolerancePct = req.query.tolerancePct != null ? Number(req.query.tolerancePct) : undefined;
      const maxTireWidthDelta = req.query.maxTireWidthDelta != null ? Number(req.query.maxTireWidthDelta) : undefined;
      const wheelPageSize = req.query.wheelPageSize != null ? Number(req.query.wheelPageSize) : undefined;

      const out = await packageEngineService.plusSize({
        vehicleId,
        targetDiameter,
        tolerancePct,
        maxTireWidthDelta,
        wheelPageSize
      });

      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  r.post('/recommend', express.json({ limit: '1mb' }), async (req, res, next) => {
    try {
      const parsed = RecommendSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
      }

      const out = await packageEngineService.recommend(parsed.data);
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  return r;
}

module.exports = { packagesRouter };
