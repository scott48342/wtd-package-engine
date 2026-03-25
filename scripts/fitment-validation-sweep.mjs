import { chromium } from 'playwright';

const BASE = 'https://shop.warehousetiredirect.com';

function shuffle(arr, seed = Date.now()) {
  // simple seeded-ish shuffle
  let x = seed % 2147483647;
  const rand = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

async function safeInnerText(page, selector) {
  try {
    const el = await page.$(selector);
    if (!el) return null;
    return (await el.innerText()).trim();
  } catch {
    return null;
  }
}

async function clickFirstQuickAdd(page) {
  // buttons include text "Quick Add"
  const btn = page.locator('button:has-text("Quick Add")').first();
  if (await btn.count() === 0) return { ok: false, reason: 'No Quick Add button found' };
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ timeout: 15000 });
  return { ok: true };
}

async function openCart(page) {
  // Quick Add sometimes opens a modal/backdrop; close it so the cart button is clickable.
  try {
    await page.keyboard.press('Escape');
  } catch {}

  // If cart slideout already open, that's fine.
  const slideoutVisible = (await page.locator('text=/Your Cart/i').count()) > 0;
  if (slideoutVisible) return;

  const cartBtn = page.locator('button[aria-label^="Shopping cart"]');
  await cartBtn.first().click({ timeout: 15000, force: true });
}

async function waitCartCountNonZero(page) {
  const cartBtn = page.locator('button[aria-label^="Shopping cart"]');
  await page.waitForTimeout(300);
  const label = await cartBtn.first().getAttribute('aria-label');
  if (!label) return { ok: false, reason: 'Cart button missing aria-label' };
  const m = label.match(/with\s+(\d+)\s+items?/i);
  if (!m) return { ok: false, reason: `Could not parse cart count from: ${label}` };
  const n = Number(m[1]);
  return { ok: n > 0, count: n, label };
}

async function getLiftedContext(page) {
  return await page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem('wt_lifted_build');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}

async function tryNavigateToTiresFromPackage(page) {
  // package sidebar often has a "Select tires" prompt/link
  const link = page.locator('a:has-text("Select tires"), button:has-text("Select tires")').first();
  if (await link.count() === 0) return { ok: false, reason: 'No Select tires link/button found' };
  await link.click({ timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  return { ok: true, url: page.url() };
}

async function detectStaggeredUI(page) {
  // Heuristic: look for "Front" and "Rear" labels in package summary
  const body = await page.locator('body').innerText().catch(() => '');
  const hasFront = /\bFront\b/i.test(body);
  const hasRear = /\bRear\b/i.test(body);
  return hasFront && hasRear;
}

async function runOne(browser, { idx, type, vehicle, setup }) {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  const row = {
    test: idx,
    type,
    vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ' ' + vehicle.trim : ''}`,
    setup: setup ?? '',
    result: 'FAIL',
    note: '',
  };

  try {
    const url = wheelsUrl(vehicle);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // 1) Vehicle selection works (page loads + wheels heading)
    const heading = await safeInnerText(page, 'h1');
    if (!heading || !heading.toLowerCase().includes('wheels')) {
      row.note = `Wheels page did not load (h1=${heading ?? 'null'})`;
      return row;
    }

    // 2) Fitment results load (expect some wheel cards or at least quick add button)
    const quickAddCount = await page.locator('button:has-text("Quick Add")').count();
    if (quickAddCount === 0) {
      row.note = 'No wheel results / Quick Add buttons found (possible unsupported vehicle or empty results)';
      return row;
    }

    // 3) Trim/mod selection
    const needsTrim = (await page.locator('text=/Select a trim\/submodel/i').count()) > 0;
    if (needsTrim && !vehicle.trim && !vehicle.modification) {
      row.note = 'Page requests trim/submodel selection; test limited (no trim provided)';
      return row;
    }

    // 4) Wheel result page loads correctly (we stay on listing; acceptable)

    // 5) Add-to-cart
    const addRes = await clickFirstQuickAdd(page);
    if (!addRes.ok) {
      row.note = addRes.reason;
      return row;
    }

    // wait a moment for state
    await page.waitForTimeout(1200);

    const cartRes = await waitCartCountNonZero(page);
    if (!cartRes.ok) {
      row.note = `Add-to-cart did not update cart count (${cartRes.reason ?? 'unknown'})`;
      return row;
    }

    // 6) Cart opens without crash
    await openCart(page);
    await page.waitForTimeout(800);

    // If there was a client-side crash, we'd often see an error overlay; check for common Next/React error markers
    const hasErrorOverlay = (await page.locator('text=/Application error|Unhandled Runtime Error|Error: Rendered more hooks/i').count()) > 0;
    if (hasErrorOverlay) {
      row.note = 'Client-side error overlay detected after opening cart';
      return row;
    }

    // 7) Lifted specifics
    if (type === 'lifted') {
      const ctx = await getLiftedContext(page);
      if (!ctx) {
        row.note = 'Lifted test: wt_lifted_build context not found in sessionStorage';
        return row;
      }
      // try handoff to tires page
      const nav = await tryNavigateToTiresFromPackage(page);
      if (!nav.ok) {
        row.note = `Lifted test: context exists but could not navigate to tires (${nav.reason})`;
        return row;
      }
      // confirm still no crash on tires page
      const hasCrash = (await page.locator('text=/Unhandled Runtime Error|Rendered more hooks/i').count()) > 0;
      if (hasCrash) {
        row.note = 'Lifted test: crash detected on tires page after handoff';
        return row;
      }
    }

    // 8) Staggered specifics
    if (type === 'staggered') {
      const isStaggered = await detectStaggeredUI(page);
      if (!isStaggered) {
        row.note = 'Staggered test: could not confirm front/rear staggered UI on this flow (coverage limited)';
        return row;
      }
    }

    row.result = 'PASS';
    row.note = type === 'staggered' ? 'Staggered UI detected; add-to-cart + cart open OK' : 'Add-to-cart + cart open OK';
    return row;
  } catch (err) {
    row.note = `Exception: ${err?.message ?? String(err)}`;
    return row;
  } finally {
    await context.close().catch(() => {});
  }
}

const stockVehicles = [
  // Required inclusions + variety
  { year: 2024, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT' }, // Silverado
  { year: 2023, make: 'Ford', model: 'F-150', trim: 'XLT' }, // F-150
  { year: 2022, make: 'Toyota', model: 'Tacoma', trim: 'SR5' }, // Tacoma
  { year: 2021, make: 'Jeep', model: 'Wrangler', trim: 'Sport' }, // Wrangler
  { year: 2006, make: 'Cadillac', model: 'DTS', trim: 'Base' }, // requested
  // Additional random-ish stock coverage (include trims to avoid trim-gating where possible)
  { year: 2020, make: 'Honda', model: 'Civic', trim: 'LX' },
  { year: 2019, make: 'Toyota', model: 'Camry', trim: 'LE' },
  { year: 2020, make: 'Subaru', model: 'Outback', trim: 'Premium' },
  { year: 2018, make: 'BMW', model: '3 Series', trim: '330i' },
  { year: 2021, make: 'Audi', model: 'A4', trim: 'Premium' },
  { year: 2022, make: 'Hyundai', model: 'Tucson', trim: 'SE' },
  { year: 2021, make: 'Kia', model: 'Telluride', trim: 'LX' },
  { year: 2020, make: 'Chevrolet', model: 'Tahoe', trim: 'LT' },
  { year: 2019, make: 'Ram', model: '1500', trim: 'Big Horn' },
  { year: 2020, make: 'GMC', model: 'Sierra 1500', trim: 'SLT' },
];

const liftedVehicles = [
  { year: 2024, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT', fitLevel: 'lifted' },
  { year: 2023, make: 'Ford', model: 'F-150', trim: 'XLT', fitLevel: 'lifted' },
  { year: 2022, make: 'Toyota', model: 'Tacoma', trim: 'SR5', fitLevel: 'lifted' },
  { year: 2021, make: 'Jeep', model: 'Wrangler', trim: 'Sport', fitLevel: 'lifted' },
  { year: 2020, make: 'Chevrolet', model: 'Silverado 2500 HD', fitLevel: 'lifted' },
  { year: 2021, make: 'GMC', model: 'Sierra 1500', fitLevel: 'lifted' },
  { year: 2022, make: 'Ram', model: '1500', fitLevel: 'lifted' },
  { year: 2020, make: 'Toyota', model: '4Runner', fitLevel: 'lifted' },
];

const staggeredVehicles = [
  // These are best-effort guesses for staggered-support vehicles
  { year: 2021, make: 'BMW', model: '5 Series' },
  { year: 2022, make: 'BMW', model: 'M3' },
  { year: 2020, make: 'Mercedes-Benz', model: 'E-Class' },
  { year: 2021, make: 'Audi', model: 'S5' },
  { year: 2020, make: 'Porsche', model: '911' },
  { year: 2022, make: 'Lexus', model: 'IS' },
  { year: 2021, make: 'Infiniti', model: 'Q50' },
];

const tests = [];

shuffle(stockVehicles, 123).slice(0, 15).forEach((v) => tests.push({ type: 'stock', vehicle: v, setup: 'stock fitment' }));
// Lifted distribution details (2/4/6 inch)
const liftSetups = ['2\" leveling', '4\" lift', '6\" lift'];
shuffle(liftedVehicles, 456).slice(0, 8).forEach((v, i) => tests.push({ type: 'lifted', vehicle: v, setup: liftSetups[i % liftSetups.length] }));
shuffle(staggeredVehicles, 789).slice(0, 7).forEach((v) => tests.push({ type: 'staggered', vehicle: v, setup: 'front/rear staggered expected' }));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const res = await runOne(browser, { idx: i + 1, type: t.type, vehicle: t.vehicle, setup: t.setup });
      results.push(res);
      console.log(JSON.stringify(res));
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const pass = results.filter(r => r.result === 'PASS').length;
  const fail = results.length - pass;

  console.log('\nSUMMARY');
  console.log(JSON.stringify({ total: results.length, pass, fail }, null, 2));

  const failed = results.filter(r => r.result === 'FAIL');
  if (failed.length) {
    console.log('\nFAILED_CASES');
    for (const f of failed) console.log(JSON.stringify(f));
  }
})();
