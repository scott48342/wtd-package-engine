const { randomUUID } = require('crypto');

class TireSizeService {
  /**
   * Parse a tire size like "225/60R18".
   * Accepts common variants (case-insensitive, optional spaces).
   */
  parseSize(sizeStr) {
    if (!sizeStr) return null;
    const s = String(sizeStr).trim().toUpperCase().replace(/\s+/g, '');

    // 225/60R18
    const m = s.match(/^(\d{3})\/(\d{2,3})R(\d{2}(?:\.\d)?)$/);
    if (!m) return null;

    const widthMm = parseInt(m[1], 10);
    const aspectRatio = parseInt(m[2], 10);
    const wheelDiameterIn = parseFloat(m[3]);

    if (!Number.isFinite(widthMm) || !Number.isFinite(aspectRatio) || !Number.isFinite(wheelDiameterIn)) return null;

    return { size: `${widthMm}/${aspectRatio}R${wheelDiameterIn % 1 === 0 ? String(wheelDiameterIn.toFixed(0)) : String(wheelDiameterIn)}`,
      widthMm,
      aspectRatio,
      wheelDiameterIn
    };
  }

  /**
   * Compute tire geometry for comparisons.
   */
  computeGeometry(parsed) {
    if (!parsed) return null;
    const { widthMm, aspectRatio, wheelDiameterIn } = parsed;

    const widthIn = widthMm / 25.4;
    const sidewallIn = (widthMm * (aspectRatio / 100)) / 25.4;
    const overallDiameterIn = wheelDiameterIn + (2 * sidewallIn);
    const circumferenceIn = Math.PI * overallDiameterIn;
    const revsPerMile = 63360 / circumferenceIn;

    return {
      sectionWidthIn: round(widthIn, 3),
      overallDiameterIn: round(overallDiameterIn, 3),
      circumferenceIn: round(circumferenceIn, 3),
      revsPerMile: round(revsPerMile, 2)
    };
  }

  /**
   * Compare two tire sizes by overall diameter.
   * Returns signed delta and percent difference.
   */
  compareByDiameter(sizeA, sizeB) {
    const a = this.parseSize(sizeA);
    const b = this.parseSize(sizeB);
    if (!a || !b) return null;

    const ga = this.computeGeometry(a);
    const gb = this.computeGeometry(b);

    const deltaIn = gb.overallDiameterIn - ga.overallDiameterIn;
    const pct = (deltaIn / ga.overallDiameterIn) * 100;

    return {
      a: { ...a, ...ga },
      b: { ...b, ...gb },
      deltaOverallDiameterIn: round(deltaIn, 3),
      percentDifference: round(pct, 3)
    };
  }

  /**
   * Upsert tire_size row and return its id.
   * @param {import('pg').Pool} db
   */
  async upsertTireSize(db, sizeStr) {
    const parsed = this.parseSize(sizeStr);
    if (!parsed) return null;
    const geom = this.computeGeometry(parsed);

    // Try to find existing
    const found = await db.query({
      text: `select id from tire_size where size = $1`,
      values: [parsed.size]
    });
    if (found.rows[0]) return found.rows[0].id;

    const id = randomUUID();
    await db.query({
      text: `
        insert into tire_size (
          id, size, width_mm, aspect_ratio, wheel_diameter_in,
          overall_diameter_in, section_width_in, circumference_in, revs_per_mile
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, $7, $8, $9
        )
      `,
      values: [
        id,
        parsed.size,
        parsed.widthMm,
        parsed.aspectRatio,
        parsed.wheelDiameterIn,
        geom.overallDiameterIn,
        geom.sectionWidthIn,
        geom.circumferenceIn,
        geom.revsPerMile
      ]
    });

    return id;
  }
}

function round(n, digits) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

module.exports = { TireSizeService };
