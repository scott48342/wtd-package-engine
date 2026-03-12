require('dotenv').config();
const { WheelProsAdapter } = require('../src/adapters/wheelpros/WheelProsAdapter');

(async () => {
  const ad = new WheelProsAdapter({
    authBaseUrl: process.env.WHEELPROS_AUTH_BASE_URL,
    productsBaseUrl: process.env.WHEELPROS_PRODUCTS_BASE_URL,
    pricingBaseUrl: process.env.WHEELPROS_PRICING_BASE_URL,
    userName: process.env.WHEELPROS_USERNAME,
    password: process.env.WHEELPROS_PASSWORD,
    company: process.env.WHEELPROS_COMPANY,
    customer: process.env.WHEELPROS_CUSTOMER,
    currencyCode: process.env.WHEELPROS_CURRENCY
  });

  const search = await ad.searchWheels({ page: 1, pageSize: 3, availabilityType: 'AVAILABLE' });
  const skus = (search.results || []).map((r) => r.sku);

  console.log('SKUs:', skus);

  const msrpBySku = await ad.getMsrpBySku(skus, { company: process.env.WHEELPROS_COMPANY, customer: process.env.WHEELPROS_CUSTOMER, currency: process.env.WHEELPROS_CURRENCY });

  for (const sku of skus) {
    console.log('\nSKU', sku);
    console.log('search.prices.msrp:', JSON.stringify(search.results.find((r) => r.sku === sku)?.prices?.msrp?.[0] || null));
    console.log('pricing.msrp:', msrpBySku.get(sku) || null);
  }
})();
