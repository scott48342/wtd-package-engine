const { createHash } = require('crypto');

class TireConnectScrapeAdapter {
  /**
   * @param {{widgetId:string, locationId:string|number, baseUrl?:string, headless?:boolean}} opts
   */
  constructor({ widgetId, locationId, baseUrl, headless = true }) {
    this.code = 'TIRECONNECT_SCRAPE';
    this.widgetId = widgetId;
    this.locationId = String(locationId);
    this.baseUrl = baseUrl || 'https://app.tireconnect.ca/instore';
    this.headless = headless;

    this._pw = null;
    this._browser = null;
  }

  getCapabilities() {
    return { code: this.code, mode: 'scrape', supportsRealtimeInventory: false };
  }

  async _getBrowser() {
    if (this._browser) return this._browser;

    // Lazy-load playwright so normal API use doesn't require it.
    // eslint-disable-next-line global-require
    const { chromium } = require('playwright');
    this._browser = await chromium.launch({ headless: this.headless });
    return this._browser;
  }

  _resultsUrl({ rawSize, page = 1 }) {
    // "display=full" is important; it exposes per-tire price in the results list.
    return `${this.baseUrl}/${this.widgetId}#!results?` +
      `size=${encodeURIComponent(rawSize)}` +
      `&order_by=price_asc` +
      `&display=full` +
      `&location_id=${encodeURIComponent(this.locationId)}` +
      `&min_quantity=1` +
      `&search_by=rawSize` +
      `&page=${encodeURIComponent(page)}` +
      `&season_id=all`;
  }

  async searchTires(query) {
    const rawSize = normalizeRawSize(query?.size || query?.rawSize || query?.tireSize);
    if (!rawSize) {
      return { results: [], totalCount: 0, page: 1, pageSize: 0, note: 'TireConnectScrapeAdapter requires raw size (e.g., 2657017) or size (265/70R17)' };
    }

    const browser = await this._getBrowser();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await page.goto(this._resultsUrl({ rawSize, page: 1 }), { waitUntil: 'networkidle' });

      // Wait for at least 1 result tile (preferred) or the summary header.
      await page.waitForTimeout(750);
      try {
        await page.waitForSelector('.tcwlw_result', { timeout: 30000 });
      } catch {
        await page.waitForSelector('text=Found', { timeout: 30000 });
      }

      const scraped = await page.evaluate(() => {
        const tiles = Array.from(document.querySelectorAll('.tcwlw_result'));

        const pickText = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

        const parseSupplierQty = (tile) => {
          // supplier link text often looks like "K&M24" or "U.S. AutoForce1"
          const candidates = Array.from(tile.querySelectorAll('a'))
            .map(a => pickText(a))
            .filter(t => t && /\d+$/.test(t) && !t.toLowerCase().includes('gallery') && !/[★$]/.test(t));
          const txt = candidates[0] || null;
          if (!txt) return { supplierName: null, qty: null };
          const m = txt.match(/^(.*?)(\d+)$/);
          if (!m) return { supplierName: txt.replace(/^[^\w]+/g, '').trim() || null, qty: null };
          return {
            supplierName: ((m[1] || '').replace(/^[^\w]+/g, '').trim()) || null,
            qty: Number(m[2])
          };
        };

        const parsePrice = (tile) => {
          const v = pickText(tile.querySelector('.tcwlw_price_value_single'));
          // "$133.86" => 133.86
          const n = Number(String(v).replace(/[^0-9.]/g, ''));
          return Number.isFinite(n) ? n : null;
        };

        const parseBrand = (tile) => {
          const h5 = pickText(tile.querySelector('h5'));
          if (h5) return h5;
          const alt = tile.querySelector('img')?.getAttribute('alt') || '';
          const cleaned = alt.replace(/\bTire\.?\b/gi, '').trim().replace(/[\s.]+$/g, '').trim();
          return cleaned || null;
        };

        const parseModel = (tile) => {
          const h3 = pickText(tile.querySelector('h3'));
          return h3 || null;
        };

        const parseSeason = (tile) => {
          // icons have alt text like "All Season" / "All Weather"
          const img = tile.querySelector('img[alt="All Season"], img[alt="All Weather"], img[alt="Winter"], img[alt="Summer"]');
          const alt = img?.getAttribute('alt') || null;
          if (!alt) return null;
          const s = alt.toLowerCase();
          if (s.includes('all season')) return 'all-season';
          if (s.includes('all weather')) return 'all-weather';
          if (s.includes('winter')) return 'winter';
          if (s.includes('summer')) return 'summer';
          return null;
        };

        const parseSize = (tile) => {
          const t = pickText(tile.querySelector('.tcwlw_tResSpecSize'));
          // "Size: 265/70R17 113T" -> "265/70R17"
          const m = t.match(/(\d{3}\/\d{2,3}R\d{2}(?:\.\d)?)/i);
          return m ? m[1].toUpperCase() : null;
        };

        const parseLoadIndex = (tile) => {
          const t = pickText(tile.querySelector('.tcwlw_tResSpecLoadIndex'));
          const m = t.match(/(\d{2,3})/);
          return m ? Number(m[1]) : null;
        };

        const parseSpeedRating = (tile) => {
          const t = pickText(tile.querySelector('.tcwlw_tResSpecSpeedRate'));
          // "Speed rating: T (118mph)" -> "T"
          const m = t.match(/Speed rating:\s*([A-Z]+)/i);
          return m ? m[1].toUpperCase() : null;
        };

        return tiles.slice(0, 20).map((tile) => {
          const { supplierName, qty } = parseSupplierQty(tile);
          const size = parseSize(tile);
          const brand = parseBrand(tile);
          const model = parseModel(tile);
          const perTire = parsePrice(tile);
          const season = parseSeason(tile);
          const loadIndex = parseLoadIndex(tile);
          const speedRating = parseSpeedRating(tile);

          return {
            brand,
            model,
            title: [brand, model, size].filter(Boolean).join(' '),
            size,
            perTire,
            season,
            loadIndex,
            speedRating,
            supplierName,
            supplierQty: qty
          };
        });
      });

      const results = scraped
        .filter(r => r && r.size)
        .map((r, idx) => {
          const key = `${r.brand || ''}|${r.model || ''}|${r.size || ''}|${r.supplierName || ''}|${r.perTire || ''}`;
          const sku = `TC-${sha1(key).slice(0, 16).toUpperCase()}-${idx + 1}`;

          return {
            sku,
            title: r.title || `Tire ${r.size}`,
            brand: r.brand || null,
            model: r.model || null,
            properties: {
              size: r.size,
              season: r.season,
              loadIndex: r.loadIndex,
              speedRating: r.speedRating,
              runFlat: null
            },
            inventory: {
              localStock: null,
              globalStock: r.supplierQty ?? null,
              type: r.supplierName || 'tireconnect'
            },
            prices: r.perTire != null
              ? { sell: [{ currencyCode: 'USD', currencyAmount: String(r.perTire) }] }
              : {},
            images: []
          };
        });

      return { results, totalCount: results.length, page: 1, pageSize: results.length };
    } finally {
      await page.close().catch(() => {});
      await ctx.close().catch(() => {});
    }
  }

  async getTireDetails(externalSku) {
    // Not implemented yet. Details endpoint can be added later.
    return { sku: externalSku };
  }
}

function sha1(s) {
  return createHash('sha1').update(String(s)).digest('hex');
}

function normalizeRawSize(input) {
  if (!input) return null;
  const s = String(input).trim().toUpperCase().replace(/\s+/g, '');

  // already raw: 2657017
  if (/^\d{7}$/.test(s)) return s;

  // 265/70R17 -> 2657017
  const m = s.match(/^(\d{3})\/(\d{2,3})R(\d{2}(?:\.\d)?)$/);
  if (m) return `${m[1]}${m[2]}${String(Number(m[3])).replace(/\.0$/, '')}`;

  return null;
}

module.exports = { TireConnectScrapeAdapter };
