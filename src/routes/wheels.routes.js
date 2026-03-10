const express = require('express');

function wheelsRouter({ wheelService }) {
  const r = express.Router();

  r.get('/search', async (req, res, next) => {
    try {
      const q = { ...req.query };

      // Basic numeric coercion for common filters
      q.page = coerceInt(q.page);
      q.pageSize = coerceInt(q.pageSize);

      q.diameter = coerceNumber(q.diameter);
      q.width = coerceNumber(q.width);
      q.minOffset = coerceNumber(q.minOffset);
      q.maxOffset = coerceNumber(q.maxOffset);

      const data = await wheelService.searchWheels(q);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  // Wheel detail
  // GET /v1/wheels/{sku}
  r.get('/:sku', async (req, res, next) => {
    try {
      const sku = req.params.sku ? String(req.params.sku) : null;
      if (!sku) return res.status(400).json({ error: 'sku_required' });
      const out = await wheelService.getWheelDetails(sku);
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  return r;
}

function coerceInt(v) {
  if (v == null || v === '') return undefined;
  const n = Number(String(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function coerceNumber(v) {
  if (v == null || v === '') return undefined;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : undefined;
}

module.exports = { wheelsRouter };
