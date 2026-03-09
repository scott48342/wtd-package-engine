const express = require('express');

function installersRouter({ installerService }) {
  const r = express.Router();

  // GET /v1/installers/lookup?zip=48126
  r.get('/lookup', async (req, res, next) => {
    try {
      const zip = req.query.zip ? String(req.query.zip).trim() : null;
      const out = await installerService.lookupBestInstallerByZip(zip);
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  return r;
}

module.exports = { installersRouter };
