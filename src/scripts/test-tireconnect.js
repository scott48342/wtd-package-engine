const { TireConnectScrapeAdapter } = require('../adapters/tires/TireConnectScrapeAdapter');

(async () => {
  const a = new TireConnectScrapeAdapter({
    widgetId: process.env.TIRECONNECT_WIDGET_ID || '5448d7b7233d7696b3bf2ca8a762dd06',
    locationId: process.env.TIRECONNECT_LOCATION_ID || '24407',
    headless: true
  });

  const r = await a.searchTires({ size: '265/70R17' });
  console.log('count', r.totalCount);
  console.log('first', r.results[0]);

  await a._browser?.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
