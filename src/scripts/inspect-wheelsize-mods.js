/* eslint-disable no-console */
require('dotenv').config();
const { WheelSizeClient } = require('../adapters/fitment/wheelSizeClient');

async function main() {
  const client = new WheelSizeClient({
    baseUrl: process.env.WHEEL_SIZE_BASE_URL,
    apiKey: process.env.WHEEL_SIZE_API_KEY,
    timeoutMs: 30_000
  });

  const year = 2020;
  const makeName = 'Chevrolet';
  const modelName = 'Silverado 2500 HD';
  const region = process.env.WHEEL_SIZE_REGION || 'usdm';

  const makes = await client.makes({ year, region });
  const make = (makes?.data || []).find((m) => String(m?.name || m?.name_en || '').toLowerCase() === makeName.toLowerCase());
  if (!make?.slug) throw new Error('make_slug_not_found');

  const models = await client.models({ make: make.slug, year, region });
  // Try exact match first; then substring fallback.
  const allModels = models?.data || [];
  const exact = allModels.find((m) => String(m?.name || m?.name_en || '').toLowerCase() === modelName.toLowerCase());
  const found = exact || allModels.find((m) => String(m?.name || m?.name_en || '').toLowerCase().includes('silverado') && String(m?.name || m?.name_en || '').includes('2500'));
  if (!found?.slug) {
    console.log('Available Silverado-like models:', allModels.filter((m) => String(m?.name || m?.name_en || '').toLowerCase().includes('silverado')).map((m) => ({ name: m.name || m.name_en, slug: m.slug })));
    throw new Error('model_slug_not_found');
  }

  const mods = await client.modifications({ make: make.slug, model: found.slug, year, region });

  const rows = Array.isArray(mods?.data) ? mods.data : [];
  console.log(JSON.stringify({
    year,
    region,
    make: { name: make.name || make.name_en, slug: make.slug },
    model: { name: found.name || found.name_en, slug: found.slug },
    modificationCount: rows.length,
    sample: rows.slice(0, 10)
  }, null, 2));
}

main().catch((e) => {
  console.error('inspect-wheelsize-mods failed:', e?.message);
  process.exit(1);
});
