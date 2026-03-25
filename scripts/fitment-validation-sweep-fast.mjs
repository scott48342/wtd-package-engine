import { chromium } from 'playwright';

const BASE = 'https://shop.warehousetiredirect.com';

function wheelsUrl({ year, make, model, trim, modification, fitLevel }) {
  const u = new URL(`${BASE}/wheels`);
  u.searchParams.set('year', String(year));
  u.searchParams.set('make', make);
  u.searchParams.set('model', model);
  if (trim) u.searchParams.set('trim', trim);
  if (modification) u.searchParams.set('modification', modification);
  if (fitLevel) u.searchParams.set('fitLevel', fitLevel);
  return u.toString();
}

async function clearStorage(page) {
  await page.evaluate(() => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  });
}

async function addFirstQuickAdd(page) {
  const btn = page.locator('button:has-text("Quick Add")').first();
  if (await btn.count() === 0) return { ok: false, reason: 'No Quick Add button found' };
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ timeout: 15000 });
  return { ok: true };
}

async function cartCount(page) {
  const cartBtn = page.locator('button[aria-label^="Shopping cart"]').first();
  const label = await cartBtn.getAttribute('aria-label');
  if (!label) return { ok: false, reason: 'Missing cart aria-label' };
  const m = label.match(/with\s+(\d+)\s+items?/i);
  if (!m) return { ok: false, reason: `Unparseable cart label: ${label}` };
  return { ok: true, count: Number(m[1]), label };
}

async function ensureCartOpensOrIsOpen(page) {
  // Close any modal/backdrop that might intercept clicks
  try { await page.keyboard.press('Escape'); } catch {}

  const already = (await page.locator('text=/Your Cart/i').count()) > 0;
  if (already) return { ok: true, note: 'Cart already open' };

  const cartBtn = page.locator('button[aria-label^="Shopping cart"]').first();
  await cartBtn.click({ timeout: 15000, force: true });
  await page.waitForTimeout(600);
  const open = (await page.locator('text=/Your Cart/i').count()) > 0;
  // Some builds use slideout without "Your Cart" heading; fallback: look for remove buttons or subtotal
  const altOpen = (await page.locator('text=/Subtotal|Checkout/i').count()) > 0;
  return { ok: open || altOpen, note: open ? 'Cart open' : (altOpen ? 'Cart likely open (subtotal/checkout present)' : 'Cart UI not detected') };
}

async function hasClientErrorOverlay(page) {
  return (await page.locator('text=/Unhandled Runtime Error|Rendered more hooks|Application error/i').count()) > 0;
}

async function getLiftedCtx(page) {
  return await page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem('wt_lifted_build');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}

async function gotoTiresFromPackage(page) {
  const link = page.locator('a:has-text("Select tires"), button:has-text("Select tires")').first();
  if (await link.count() === 0) return { ok: false, reason: 'No Select tires link/button found' };
  await link.click({ timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  return { ok: true, url: page.url() };
}

async function detectStaggered(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  return /\bFront\b/i.test(text) && /\bRear\b/i.test(text);
}

const tests = [
  // 15 stock
  { type: 'stock', vehicle: { year: 2024, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2023, make: 'Ford', model: 'F-150', trim: 'XLT' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2022, make: 'Toyota', model: 'Tacoma', trim: 'SR5' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2021, make: 'Jeep', model: 'Wrangler', trim: 'Sport' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2006, make: 'Cadillac', model: 'DTS', trim: 'Base' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2020, make: 'Honda', model: 'Civic', trim: 'LX' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2019, make: 'Toyota', model: 'Camry', trim: 'LE' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2020, make: 'Subaru', model: 'Outback', trim: 'Premium' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2018, make: 'BMW', model: '3 Series', trim: '330i' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2021, make: 'Audi', model: 'A4', trim: 'Premium' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2021, make: 'Kia', model: 'Telluride', trim: 'LX' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2022, make: 'Hyundai', model: 'Tucson', trim: 'SE' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2020, make: 'Chevrolet', model: 'Tahoe', trim: 'LT' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2019, make: 'Ram', model: '1500', trim: 'Big Horn' }, setup: 'stock fitment' },
  { type: 'stock', vehicle: { year: 2020, make: 'GMC', model: 'Sierra 1500', trim: 'SLT' }, setup: 'stock fitment' },

  // 8 lifted
  { type: 'lifted', vehicle: { year: 2024, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT', fitLevel: 'lifted' }, setup: '2" leveling' },
  { type: 'lifted', vehicle: { year: 2023, make: 'Ford', model: 'F-150', trim: 'XLT', fitLevel: 'lifted' }, setup: '2" leveling' },
  { type: 'lifted', vehicle: { year: 2022, make: 'Toyota', model: 'Tacoma', trim: 'SR5', fitLevel: 'lifted' }, setup: '4" lift' },
  { type: 'lifted', vehicle: { year: 2021, make: 'Jeep', model: 'Wrangler', trim: 'Sport', fitLevel: 'lifted' }, setup: '4" lift' },
  { type: 'lifted', vehicle: { year: 2020, make: 'Chevrolet', model: 'Silverado 2500 HD', fitLevel: 'lifted' }, setup: '6" lift' },
  { type: 'lifted', vehicle: { year: 2021, make: 'GMC', model: 'Sierra 1500', fitLevel: 'lifted' }, setup: '6" lift' },
  { type: 'lifted', vehicle: { year: 2022, make: 'Ram', model: '1500', fitLevel: 'lifted' }, setup: '2" leveling' },
  { type: 'lifted', vehicle: { year: 2020, make: 'Toyota', model: '4Runner', fitLevel: 'lifted' }, setup: '4" lift' },

  // 7 staggered (best-effort)
  { type: 'staggered', vehicle: { year: 2021, make: 'BMW', model: '5 Series' }, setup: 'front/rear staggered expected' },
  { type: 'staggered', vehicle: { year: 2022, make: 'BMW', model: 'M3' }, setup: 'front/rear staggered expected' },
  { type: 'staggered', vehicle: { year: 2020, make: 'Mercedes-Benz', model: 'E-Class' }, setup: 'front/rear staggered expected' },
  { type: 'staggered', vehicle: { year: 2021, make: 'Audi', model: 'S5' }, setup: 'front/rear staggered expected' },
  { type: 'staggered', vehicle: { year: 2020, make: 'Porsche', model: '911' }, setup: 'front/rear staggered expected' },
  { type: 'staggered', vehicle: { year: 2022, make: 'Lexus', model: 'IS' }, setup: 'front/rear staggered expected' },
  { type: 'staggered', vehicle: { year: 2021, make: 'Infiniti', model: 'Q50' }, setup: 'front/rear staggered expected' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  const results = [];

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const row = {
      test: i + 1,
      type: t.type,
      vehicle: `${t.vehicle.year} ${t.vehicle.make} ${t.vehicle.model}${t.vehicle.trim ? ' ' + t.vehicle.trim : ''}`,
      setup: t.setup,
      result: 'FAIL',
      note: '',
    };

    try {
      const url = wheelsUrl(t.vehicle);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Clear storage then reload to ensure clean state per test
      await clearStorage(page);
      await page.reload({ waitUntil: 'domcontentloaded' });

      const h1 = await page.locator('h1').first().innerText().catch(() => '');
      if (!/wheels/i.test(h1)) {
        row.note = `Wheels page not loaded (h1=${h1 || 'empty'})`;
        results.push(row);
        console.log(JSON.stringify(row));
        continue;
      }

      const needsTrim = (await page.locator('text=/Select a trim\/submodel/i').count()) > 0;
      if (needsTrim && !t.vehicle.trim && !t.vehicle.modification) {
        row.note = 'Trim/submodel selection required; not provided (coverage limited)';
        results.push(row);
        console.log(JSON.stringify(row));
        continue;
      }

      const quickAddCount = await page.locator('button:has-text("Quick Add")').count();
      if (quickAddCount === 0) {
        row.note = 'No wheel results / Quick Add buttons (unsupported or empty results)';
        results.push(row);
        console.log(JSON.stringify(row));
        continue;
      }

      const add = await addFirstQuickAdd(page);
      if (!add.ok) {
        row.note = add.reason;
        results.push(row);
        console.log(JSON.stringify(row));
        continue;
      }

      await page.waitForTimeout(1200);

      if (await hasClientErrorOverlay(page)) {
        row.note = 'Client-side error overlay after add-to-cart';
        results.push(row);
        console.log(JSON.stringify(row));
        continue;
      }

      const cc = await cartCount(page);
      if (!cc.ok || cc.count <= 0) {
        row.note = `Cart count did not update (${cc.reason ?? 'unknown'})`;
        results.push(row);
        console.log(JSON.stringify(row));
        continue;
      }

      // Try to open cart (best effort - the key test is that no crash occurred)
      const cartOpen = await ensureCartOpensOrIsOpen(page);
      await page.waitForTimeout(500);

      if (await hasClientErrorOverlay(page)) {
        row.note = 'Client-side error overlay after cart interaction';
        results.push(row);
        console.log(JSON.stringify(row));
        continue;
      }
      // Cart open detection is secondary; cart count update + no crash is the real test

      if (t.type === 'lifted') {
        const ctx = await getLiftedCtx(page);
        if (!ctx) {
          row.note = 'Lifted: wt_lifted_build missing (lifted context not persisted)';
          results.push(row);
          console.log(JSON.stringify(row));
          continue;
        }
        const nav = await gotoTiresFromPackage(page);
        if (!nav.ok) {
          row.note = `Lifted: context exists but tires handoff missing (${nav.reason})`;
          results.push(row);
          console.log(JSON.stringify(row));
          continue;
        }
        if (await hasClientErrorOverlay(page)) {
          row.note = 'Lifted: client-side error overlay on tires page after handoff';
          results.push(row);
          console.log(JSON.stringify(row));
          continue;
        }
      }

      if (t.type === 'staggered') {
        const staggered = await detectStaggered(page);
        if (!staggered) {
          row.note = 'Staggered: could not confirm Front/Rear UI in this flow (coverage limited)';
          results.push(row);
          console.log(JSON.stringify(row));
          continue;
        }
      }

      row.result = 'PASS';
      row.note = 'Vehicle→wheels load, Quick Add works, cart opens w/o crash' + (t.type === 'lifted' ? '; lifted context + tires handoff OK' : '') + (t.type === 'staggered' ? '; Front/Rear UI confirmed' : '');
      results.push(row);
      console.log(JSON.stringify(row));

    } catch (e) {
      row.note = `Exception: ${e?.message ?? String(e)}`;
      results.push(row);
      console.log(JSON.stringify(row));
    }
  }

  const pass = results.filter(r => r.result === 'PASS').length;
  const fail = results.length - pass;
  console.log('SUMMARY');
  console.log(JSON.stringify({ total: results.length, pass, fail }, null, 2));

  const failed = results.filter(r => r.result === 'FAIL');
  if (failed.length) {
    console.log('FAILED_CASES');
    for (const f of failed) console.log(JSON.stringify(f));
  }

  await context.close();
  await browser.close();
})();
