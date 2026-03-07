require('dotenv').config();

const { loadConfig } = require('./config');
const { createPool } = require('./db/pool');
const { createApp } = require('./app');

const { VehicleService } = require('./services/VehicleService');
const { FitmentService } = require('./services/FitmentService');
const { WheelService } = require('./services/WheelService');
const { TireService } = require('./services/TireService');
const { PackageEngineService } = require('./services/PackageEngineService');
const { TireSizeService } = require('./services/TireSizeService');

const { WheelProsAdapter } = require('./adapters/wheelpros/WheelProsAdapter');
const { WheelSizeFitmentAdapter } = require('./adapters/fitment/WheelSizeFitmentAdapter');
const { MockTireAdapter } = require('./adapters/tires/MockTireAdapter');

async function main() {
  const config = loadConfig();
  const db = createPool({ databaseUrl: config.DATABASE_URL });

  const vehicleService = new VehicleService({ db });

  // Fitment provider (MVP: Wheel-Size API scaffold)
  const fitmentProvider = new WheelSizeFitmentAdapter({
    baseUrl: config.WHEELSIZE_BASE_URL,
    apiKey: config.WHEELSIZE_API_KEY
  });
  const fitmentService = new FitmentService({ db, provider: fitmentProvider });

  // Wheel supplier (MVP: Wheel Pros)
  const wheelAdapter = new WheelProsAdapter({
    authBaseUrl: config.WHEELPROS_AUTH_BASE_URL,
    productsBaseUrl: config.WHEELPROS_PRODUCTS_BASE_URL,
    userName: config.WHEELPROS_USERNAME,
    password: config.WHEELPROS_PASSWORD,
    company: config.WHEELPROS_COMPANY,
    currencyCode: config.WHEELPROS_CURRENCY
  });
  const tireSizeService = new TireSizeService();

  const wheelService = new WheelService({ db, wheelAdapter, tireSizeService });

  // Tire supplier (MVP: mock/stub, but persists into structured tables)
  const tireAdapter = new MockTireAdapter();
  const tireService = new TireService({ db, tireAdapter, tireSizeService });

  const packageEngineService = new PackageEngineService({
    vehicleService,
    fitmentService,
    wheelService,
    tireService
  });

  const app = createApp({
    config,
    services: { vehicleService, fitmentService, wheelService, tireService, packageEngineService }
  });

  app.listen(config.PORT, () => {
    console.log(`WTD package engine listening on http://127.0.0.1:${config.PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
