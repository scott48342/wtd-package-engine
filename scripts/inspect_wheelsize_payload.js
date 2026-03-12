require('dotenv').config();
const { WheelSizeClient } = require('../src/adapters/fitment/wheelSizeClient');

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

(async () => {
  const c = new WheelSizeClient({ baseUrl: process.env.WHEEL_SIZE_BASE_URL, apiKey: process.env.WHEEL_SIZE_API_KEY });
  const year = 2020;
  const make = 'Audi';
  const model = 'S5';

  const makeSlug = slugify(make);
  const modelSlug = slugify(model);

  const payload = await c.searchByModel({ make: makeSlug, model: modelSlug, year, region: 'usdm' });
  const rows = payload?.data || [];
  console.log('rows', rows.length);

  const r0 = rows[0];
  console.log('row0 keys', Object.keys(r0 || {}));
  console.log('row0.technical keys', Object.keys(r0?.technical || {}));
  console.log('row0.wheels isArray', Array.isArray(r0?.wheels), 'len', r0?.wheels?.length);

  if (Array.isArray(r0?.wheels) && r0.wheels[0]) {
    const w0 = r0.wheels[0];
    console.log('wheel[0] keys', Object.keys(w0 || {}));
    console.log('wheel[0].is_stock', w0?.is_stock);
    console.log('wheel[0].front', w0?.front);
    console.log('wheel[0].rear', w0?.rear);
  }
})();
