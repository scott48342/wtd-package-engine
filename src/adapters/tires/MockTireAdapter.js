class MockTireAdapter {
  constructor() {
    this.code = 'MOCK_TIRE';
  }

  getCapabilities() {
    return { code: this.code, mode: 'api', supportsRealtimeInventory: false };
  }

  async searchTires(query) {
    const size = query?.size || query?.tireSize || null;
    const wheelDiameter = query?.wheelDiameter != null ? Number(query.wheelDiameter) : null;

    // If size is known, offer a couple plus-size-ish variants for demo.
    const sizes = [];
    if (size) {
      sizes.push(size);
      const alt = plusOneWheelDiameter(size);
      if (alt) sizes.push(alt);
    } else if (wheelDiameter) {
      // fallback: fabricate a common-ish size for that wheel diameter
      sizes.push(`275/55R${wheelDiameter}`);
    } else {
      sizes.push('265/70R17');
    }

    const results = sizes.map((s, idx) => {
      const sku = `MOCK-${s.replace(/[^0-9A-Z]/g, '')}-${idx + 1}`;
      return {
        sku,
        title: `Mock Tire ${s}`,
        brand: 'MockBrand',
        model: 'TrailPlus',
        properties: {
          size: s,
          season: 'all-season',
          loadIndex: 115,
          speedRating: 'T',
          runFlat: false
        },
        inventory: {
          localStock: 4,
          globalStock: 12,
          type: 'mock'
        },
        prices: {
          msrp: [{ currencyCode: 'USD', currencyAmount: String(210 + (idx * 20)) }]
        },
        images: []
      };
    });

    return { results, totalCount: results.length, page: 1, pageSize: results.length };
  }

  async getTireDetails(externalSku) {
    // In a real adapter you'd fetch by SKU.
    // For mock, just return a stable placeholder.
    return {
      sku: externalSku,
      title: `Mock Tire ${externalSku}`,
      brand: 'MockBrand',
      model: 'TrailPlus',
      properties: {
        size: '265/70R17',
        season: 'all-season',
        loadIndex: 115,
        speedRating: 'T',
        runFlat: false
      },
      inventory: {
        localStock: 4,
        globalStock: 12,
        type: 'mock'
      },
      prices: {
        msrp: [{ currencyCode: 'USD', currencyAmount: '210' }]
      },
      images: []
    };
  }
}

function plusOneWheelDiameter(sizeStr) {
  const s = String(sizeStr).trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(\d{3})\/(\d{2,3})R(\d{2}(?:\.\d)?)$/);
  if (!m) return null;
  const w = m[1];
  const a = m[2];
  const d = Number(m[3]);
  if (!Number.isFinite(d)) return null;
  return `${w}/${a}R${d + 1}`;
}

module.exports = { MockTireAdapter };
