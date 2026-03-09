const express = require('express');

function tiresRouter({ wheelService }) {
  const r = express.Router();

  // Temporary: WheelPros tire search passthrough + normalization (no DB persistence yet)
  r.get('/search', async (req, res, next) => {
    try {
      const q = { ...req.query };
      q.page = coerceInt(q.page);
      q.pageSize = coerceInt(q.pageSize);
      q.wheelDiameter = coerceNumber(q.wheelDiameter);
      q.aspectRatio = coerceInt(q.aspectRatio);

      const data = await wheelService.searchTires(q);
      res.json(data);
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

module.exports = { tiresRouter };
