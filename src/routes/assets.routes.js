const express = require('express');
const { randomUUID } = require('crypto');

function assetsRouter({ db }) {
  const r = express.Router();

  // GET /v1/assets/tire?km=... or ?sizeRaw=...
  r.get('/tire', async (req, res, next) => {
    try {
      const km = req.query.km ? String(req.query.km).trim() : null;
      const sizeRaw = req.query.sizeRaw ? String(req.query.sizeRaw).trim() : null;

      if (!km && !sizeRaw) return res.status(400).json({ error: 'km_or_sizeRaw_required' });

      const clauses = [];
      const values = [];
      if (km) {
        values.push(km);
        clauses.push(`km_description = $${values.length}`);
      }
      if (sizeRaw) {
        values.push(sizeRaw);
        clauses.push(`tire_size_raw = $${values.length}`);
      }

      const q = `select km_description, tire_size_raw, display_name, image_url, source, updated_at from tire_asset_cache where ${clauses.join(' or ')} limit 50`;
      const out = await db.query(q, values);
      res.json({ results: out.rows });
    } catch (e) {
      next(e);
    }
  });

  // POST /v1/assets/tire
  // body: { kmDescription, tireSizeRaw?, imageUrl?, displayName?, source? }
  r.post('/tire', express.json(), async (req, res, next) => {
    try {
      const kmDescription = req.body?.kmDescription ? String(req.body.kmDescription).trim() : null;
      const tireSizeRaw = req.body?.tireSizeRaw ? String(req.body.tireSizeRaw).trim() : null;
      const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl).trim() : null;
      const displayName = req.body?.displayName ? String(req.body.displayName).trim() : null;
      const source = req.body?.source ? String(req.body.source).trim() : 'manual';

      if (!kmDescription) return res.status(400).json({ error: 'kmDescription_required' });

      const id = randomUUID();
      await db.query(
        `insert into tire_asset_cache (id, km_description, tire_size_raw, image_url, display_name, source, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,now(),now())
         on conflict (km_description) do update set
           tire_size_raw=excluded.tire_size_raw,
           image_url=excluded.image_url,
           display_name=excluded.display_name,
           source=excluded.source,
           updated_at=now()`,
        [id, kmDescription, tireSizeRaw, imageUrl, displayName, source]
      );

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

module.exports = { assetsRouter };
