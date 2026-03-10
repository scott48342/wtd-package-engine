require('dotenv').config();

const { loadConfig } = require('./config');
const { createPool } = require('./db/pool');
const { createApp } = require('./app');

const { VehicleService } = require('./services/VehicleService');
const { FitmentService } = require('./services/FitmentService');
const { WheelService } = require('./services/WheelService');
const { WheelSizeCatalogService } = require('./services/WheelSizeCatalogService');
const { TireService } = require('./services/TireService');
const { PackageEngineService } = require('./services/PackageEngineService');
const { TireSizeService } = require('./services/TireSizeService');
const { InstallerService } = require('./services/InstallerService');

const { WheelProsAdapter } = require('./adapters/wheelpros/WheelProsAdapter');
const { WheelSizeFitmentAdapter } = require('./adapters/fitment/WheelSizeFitmentAdapter');
const { TireConnectScrapeAdapter } = require('./adapters/tires/TireConnectScrapeAdapter');

async function main() {
  const config = loadConfig();
  const db = createPool({ databaseUrl: config.DATABASE_URL });

  const vehicleService = new VehicleService({ db });

  // Fitment provider (MVP: Wheel-Size API)
  const fitmentProvider = new WheelSizeFitmentAdapter({
    baseUrl: config.WHEEL_SIZE_BASE_URL,
    apiKey: config.WHEEL_SIZE_API_KEY
  });
  const fitmentService = new FitmentService({
    db,
    provider: fitmentProvider,
    cacheTtlDays: config.FITMENT_CACHE_TTL_DAYS
  });

  const wheelSizeCatalogService = new WheelSizeCatalogService({
    db,
    baseUrl: config.WHEEL_SIZE_BASE_URL,
    apiKey: config.WHEEL_SIZE_API_KEY,
    cacheTtlDays: config.FITMENT_CACHE_TTL_DAYS
  });

  // Wheel supplier (MVP: Wheel Pros)
  const wheelAdapter = new WheelProsAdapter({
    authBaseUrl: config.WHEELPROS_AUTH_BASE_URL,
    productsBaseUrl: config.WHEELPROS_PRODUCTS_BASE_URL,
    pricingBaseUrl: config.WHEELPROS_PRICING_BASE_URL,
    userName: config.WHEELPROS_USERNAME,
    password: config.WHEELPROS_PASSWORD,
    company: config.WHEELPROS_COMPANY,
    customer: config.WHEELPROS_CUSTOMER,
    currencyCode: config.WHEELPROS_CURRENCY
  });
  const tireSizeService = new TireSizeService();

  const wheelService = new WheelService({ db, wheelAdapter, tireSizeService });

  // Tire supplier (MVP: TireConnect scrape; persists into structured tables)
  const tireAdapter = (config.TIRECONNECT_WIDGET_ID && config.TIRECONNECT_LOCATION_ID)
    ? new TireConnectScrapeAdapter({
      widgetId: config.TIRECONNECT_WIDGET_ID,
      locationId: config.TIRECONNECT_LOCATION_ID,
      baseUrl: config.TIRECONNECT_BASE_URL,
      headless: true
    })
    : null;

  const tireService = new TireService({ db, tireAdapter, tireSizeService });

  const packageEngineService = new PackageEngineService({
    vehicleService,
    fitmentService,
    wheelService,
    tireService,
    tireSizeService
  });

  const installerService = new InstallerService({
    db,
    cacheTtlDays: config.FITMENT_CACHE_TTL_DAYS,
    googlePlacesApiKey: config.GOOGLE_PLACES_API_KEY,
    googlePlacesBaseUrl: config.GOOGLE_PLACES_BASE_URL
  });

  const app = createApp({
    config,
    services: { vehicleService, fitmentService, wheelService, wheelSizeCatalogService, tireService, packageEngineService, installerService }
  });

  app.listen(config.PORT, () => {
    console.log(`WTD package engine listening on http://127.0.0.1:${config.PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
