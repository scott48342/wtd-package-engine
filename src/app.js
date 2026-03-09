const express = require('express');
const morgan = require('morgan');

const { vehiclesRouter } = require('./routes/vehicles.routes');
const { wheelsRouter } = require('./routes/wheels.routes');
const { packagesRouter } = require('./routes/packages.routes');

function createApp({ config, services }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(morgan('dev'));

  // Optional API key gate (MVP)
  app.use((req, res, next) => {
    if (!config.API_KEY) return next();
    const got = req.header('x-api-key');
    if (got !== config.API_KEY) return res.status(401).json({ error: 'unauthorized' });
    next();
  });

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/v1/vehicles', vehiclesRouter({
    vehicleService: services.vehicleService,
    fitmentService: services.fitmentService,
    wheelService: services.wheelService,
    wheelSizeCatalogService: services.wheelSizeCatalogService
  }));

  app.use('/v1/wheels', wheelsRouter({
    wheelService: services.wheelService
  }));

  app.use('/v1/packages', packagesRouter({
    packageEngineService: services.packageEngineService
  }));

  // Error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err?.response?.status || 500;
    res.status(status).json({
      error: err.message || 'error',
      // Upstream provider/API error payload (WheelPros, Wheel-Size, etc.)
      upstream: err?.response?.data || undefined,
      upstreamStatus: err?.response?.status || undefined,
      // Back-compat (older clients expected wheelPros field)
      wheelPros: err?.response?.data || undefined,
      details: err.details || undefined
    });
  });

  return app;
}

module.exports = { createApp };
