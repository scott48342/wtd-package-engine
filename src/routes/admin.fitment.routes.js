/**
 * Admin Fitment Bulk Import Routes
 * 
 * POST /v1/admin/fitment/bulk - Bulk import generation-based fitment records
 * 
 * This endpoint accepts normalized fitment records directly (without Wheel-Size dependency)
 * and upserts them into the database.
 * 
 * Security: Requires admin API key (X-Admin-Key header)
 */

const express = require('express');
const { randomUUID } = require('crypto');

function adminFitmentRouter({ db, config }) {
  const r = express.Router();

  // Admin auth middleware
  r.use((req, res, next) => {
    const adminKey = config.ADMIN_API_KEY || config.API_KEY;
    if (!adminKey) {
      return res.status(500).json({ error: 'admin_auth_not_configured' });
    }
    
    const providedKey = req.header('X-Admin-Key') || req.header('X-API-Key');
    if (providedKey !== adminKey) {
      return res.status(401).json({ error: 'unauthorized', message: 'Valid admin key required' });
    }
    next();
  });

  /**
   * POST /v1/admin/fitment/bulk
   * 
   * Bulk import fitment records.
   * 
   * Request body:
   * {
   *   dryRun: boolean,           // If true, validate only, don't persist
   *   backup: boolean,           // If true, return existing records before overwriting
   *   overwrite: boolean,        // If true, overwrite existing records
   *   records: [
   *     {
   *       year: number,
   *       make: string,
   *       model: string,
   *       trim?: string,
   *       generation?: string,
   *       fitment: {
   *         boltPattern: string,
   *         boltPatternImperial?: string,
   *         centerBoreMm: number,
   *         threadSize?: string,
   *         torqueNm?: number,
   *         offsetMinMm?: number,
   *         offsetMaxMm?: number,
   *         oemWheelSizes?: array,
   *         oemTireSizes?: array
   *       },
   *       fitmentLevel?: string,     // "generation-baseline", "verified", etc.
   *       fitmentSource?: string,    // "generation", "wheel-size.com", etc.
   *       generationFile?: string,   // Reference to generation file
   *       metadata?: object
   *     }
   *   ]
   * }
   * 
   * Response:
   * {
   *   success: boolean,
   *   dryRun: boolean,
   *   summary: { created, updated, skipped, failed },
   *   backup?: [...],  // Existing records if backup=true
   *   results: [...],  // Per-record results
   *   conflicts: [...]
   * }
   */
  r.post('/bulk', express.json({ limit: '10mb' }), async (req, res, next) => {
    try {
      const { 
        dryRun = false, 
        backup = false, 
        overwrite = false,
        records = [] 
      } = req.body;

      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'records_required', message: 'Array of records required' });
      }

      if (records.length > 500) {
        return res.status(400).json({ error: 'batch_too_large', message: 'Max 500 records per request' });
      }

      const summary = { created: 0, updated: 0, skipped: 0, failed: 0 };
      const results = [];
      const conflicts = [];
      const backupRecords = [];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const vehicle = `${record.year} ${record.make} ${record.model}`;

        try {
          // Validate required fields
          const validation = validateRecord(record);
          if (!validation.valid) {
            results.push({ index: i, vehicle, status: 'failed', error: validation.error });
            conflicts.push({ index: i, vehicle, error: validation.error });
            summary.failed++;
            continue;
          }

          // Check for existing record
          const existing = await findExistingVehicleFitment(db, record);

          if (existing) {
            // Backup existing if requested
            if (backup) {
              backupRecords.push({
                vehicle,
                existing: formatExistingRecord(existing)
              });
            }

            // Skip if overwrite not allowed and existing has higher confidence
            if (!overwrite && shouldPreserveExisting(existing, record)) {
              results.push({ 
                index: i, 
                vehicle, 
                status: 'skipped', 
                reason: 'existing_record_preserved',
                existingSource: existing.provider
              });
              summary.skipped++;
              continue;
            }

            // Update existing
            if (!dryRun) {
              await upsertFitment(db, record, existing.vehicleId);
            }
            results.push({ index: i, vehicle, status: 'updated', generation: record.generation });
            summary.updated++;

          } else {
            // Create new
            if (!dryRun) {
              await upsertFitment(db, record, null);
            }
            results.push({ index: i, vehicle, status: 'created', generation: record.generation });
            summary.created++;
          }

        } catch (err) {
          results.push({ index: i, vehicle, status: 'failed', error: err.message });
          conflicts.push({ index: i, vehicle, error: err.message, stack: err.stack });
          summary.failed++;
        }
      }

      res.json({
        success: summary.failed === 0,
        dryRun,
        summary,
        backup: backup ? backupRecords : undefined,
        results,
        conflicts: conflicts.length > 0 ? conflicts : undefined
      });

    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /v1/admin/fitment/export
   * 
   * Export existing fitment records for a vehicle family.
   */
  r.get('/export', async (req, res, next) => {
    try {
      const make = req.query.make?.trim();
      const model = req.query.model?.trim();
      const yearFrom = req.query.yearFrom ? Number(req.query.yearFrom) : null;
      const yearTo = req.query.yearTo ? Number(req.query.yearTo) : null;

      if (!make || !model) {
        return res.status(400).json({ error: 'make_and_model_required' });
      }

      const query = {
        text: `
          SELECT v.id, v.year, v.make, v.model, v.trim,
                 vf.bolt_pattern, vf.center_bore_mm, vf.min_offset_mm, vf.max_offset_mm,
                 vf.notes,
                 vfs.provider, vfs.as_of, vfs.confidence, vfs.quality
          FROM vehicle v
          LEFT JOIN vehicle_fitment vf ON vf.vehicle_id = v.id AND vf.vehicle_modification_id IS NULL
          LEFT JOIN vehicle_fitment_source vfs ON vfs.vehicle_fitment_id = vf.id
          WHERE LOWER(v.make) = LOWER($1)
            AND LOWER(v.model) = LOWER($2)
            ${yearFrom ? 'AND v.year >= $3' : ''}
            ${yearTo ? `AND v.year <= $${yearFrom ? 4 : 3}` : ''}
          ORDER BY v.year DESC
        `,
        values: [make, model, ...(yearFrom ? [yearFrom] : []), ...(yearTo ? [yearTo] : [])]
      };

      const { rows } = await db.query(query);

      res.json({
        make,
        model,
        yearRange: yearFrom || yearTo ? `${yearFrom || 'any'}-${yearTo || 'any'}` : 'all',
        count: rows.length,
        records: rows.map(r => ({
          year: r.year,
          make: r.make,
          model: r.model,
          trim: r.trim,
          fitment: {
            boltPattern: r.bolt_pattern,
            centerBoreMm: r.center_bore_mm ? Number(r.center_bore_mm) : null,
            offsetMinMm: r.min_offset_mm ? Number(r.min_offset_mm) : null,
            offsetMaxMm: r.max_offset_mm ? Number(r.max_offset_mm) : null
          },
          source: {
            provider: r.provider,
            asOf: r.as_of,
            confidence: r.confidence,
            quality: r.quality
          }
        }))
      });

    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /v1/admin/fitment/validate
   * 
   * Validate a single vehicle's fitment against expected values.
   */
  r.get('/validate', async (req, res, next) => {
    try {
      const year = req.query.year ? Number(req.query.year) : null;
      const make = req.query.make?.trim();
      const model = req.query.model?.trim();
      const expectedBoltPattern = req.query.boltPattern?.trim();
      const expectedGeneration = req.query.generation?.trim();

      if (!year || !make || !model) {
        return res.status(400).json({ error: 'year_make_model_required' });
      }

      const { rows } = await db.query({
        text: `
          SELECT v.id, v.year, v.make, v.model,
                 vf.bolt_pattern, vf.center_bore_mm, vf.min_offset_mm, vf.max_offset_mm,
                 vf.notes,
                 vfs.provider, vfs.quality
          FROM vehicle v
          LEFT JOIN vehicle_fitment vf ON vf.vehicle_id = v.id AND vf.vehicle_modification_id IS NULL
          LEFT JOIN vehicle_fitment_source vfs ON vfs.vehicle_fitment_id = vf.id
          WHERE v.year = $1 AND LOWER(v.make) = LOWER($2) AND LOWER(v.model) = LOWER($3)
          LIMIT 1
        `,
        values: [year, make, model]
      });

      const record = rows[0];

      if (!record) {
        return res.json({
          found: false,
          vehicle: `${year} ${make} ${model}`,
          validation: { boltPattern: 'NOT_FOUND', generation: 'NOT_FOUND' }
        });
      }

      // Parse generation from notes if present
      let actualGeneration = null;
      try {
        const notes = record.notes ? JSON.parse(record.notes) : {};
        actualGeneration = notes.generation || null;
      } catch {}

      const validation = {
        boltPattern: expectedBoltPattern 
          ? (record.bolt_pattern === expectedBoltPattern ? 'PASS' : 'FAIL')
          : 'NOT_CHECKED',
        generation: expectedGeneration
          ? (actualGeneration === expectedGeneration ? 'PASS' : 'FAIL')
          : 'NOT_CHECKED'
      };

      res.json({
        found: true,
        vehicle: `${year} ${make} ${model}`,
        actual: {
          boltPattern: record.bolt_pattern,
          generation: actualGeneration,
          centerBoreMm: record.center_bore_mm ? Number(record.center_bore_mm) : null,
          offsetRange: [
            record.min_offset_mm ? Number(record.min_offset_mm) : null,
            record.max_offset_mm ? Number(record.max_offset_mm) : null
          ],
          source: record.provider
        },
        expected: {
          boltPattern: expectedBoltPattern || null,
          generation: expectedGeneration || null
        },
        validation,
        passed: !Object.values(validation).includes('FAIL')
      });

    } catch (err) {
      next(err);
    }
  });

  return r;
}

// ============ Helper Functions ============

function validateRecord(record) {
  if (!record.year || !Number.isFinite(record.year)) {
    return { valid: false, error: 'year_required' };
  }
  if (record.year < 1950 || record.year > 2030) {
    return { valid: false, error: 'year_out_of_range' };
  }
  if (!record.make?.trim()) {
    return { valid: false, error: 'make_required' };
  }
  if (!record.model?.trim()) {
    return { valid: false, error: 'model_required' };
  }
  if (!record.fitment) {
    return { valid: false, error: 'fitment_required' };
  }
  if (!record.fitment.boltPattern) {
    return { valid: false, error: 'bolt_pattern_required' };
  }

  // Validate bolt pattern format
  const bpMatch = record.fitment.boltPattern.match(/^(\d+)x(\d+(?:\.\d+)?)$/i);
  if (!bpMatch) {
    return { valid: false, error: 'invalid_bolt_pattern_format' };
  }

  const lugCount = parseInt(bpMatch[1]);
  if (lugCount < 4 || lugCount > 10) {
    return { valid: false, error: 'invalid_lug_count' };
  }

  // Detect potential 1500/HD contamination
  const model = record.model.toLowerCase();
  const fitmentLugs = lugCount;
  
  // 1500s should be 5 or 6 lug, HDs are typically 8 lug
  if ((model.includes('1500') && !model.includes('2500') && !model.includes('3500')) && fitmentLugs === 8) {
    return { valid: false, error: 'potential_hd_contamination_in_1500' };
  }

  if ((model.includes('2500') || model.includes('3500')) && fitmentLugs < 8) {
    return { valid: false, error: 'potential_1500_contamination_in_hd' };
  }

  return { valid: true };
}

async function findExistingVehicleFitment(db, record) {
  const { rows } = await db.query({
    text: `
      SELECT v.id as vehicle_id, v.year, v.make, v.model,
             vf.id as fitment_id, vf.bolt_pattern, vf.center_bore_mm, vf.notes,
             vfs.provider, vfs.confidence, vfs.quality, vfs.as_of
      FROM vehicle v
      LEFT JOIN vehicle_fitment vf ON vf.vehicle_id = v.id AND vf.vehicle_modification_id IS NULL
      LEFT JOIN vehicle_fitment_source vfs ON vfs.vehicle_fitment_id = vf.id
      WHERE v.year = $1 AND LOWER(v.make) = LOWER($2) AND LOWER(v.model) = LOWER($3)
      LIMIT 1
    `,
    values: [record.year, record.make.trim(), record.model.trim()]
  });

  return rows[0] || null;
}

function shouldPreserveExisting(existing, incoming) {
  // Preserve existing if it has higher confidence/quality
  const existingProvider = existing.provider?.toLowerCase() || '';
  const incomingSource = incoming.fitmentSource?.toLowerCase() || '';

  // Verified/wheel-size data takes precedence over generation baseline
  if (existingProvider.includes('wheel_size') || existingProvider.includes('verified')) {
    if (incomingSource === 'generation' || incoming.fitmentLevel === 'generation-baseline') {
      return true;
    }
  }

  // If existing has confidence score, compare
  if (existing.confidence && incoming.metadata?.confidence) {
    return Number(existing.confidence) >= Number(incoming.metadata.confidence);
  }

  return false;
}

function formatExistingRecord(existing) {
  return {
    vehicleId: existing.vehicle_id,
    year: existing.year,
    make: existing.make,
    model: existing.model,
    fitment: {
      boltPattern: existing.bolt_pattern,
      centerBoreMm: existing.center_bore_mm ? Number(existing.center_bore_mm) : null
    },
    source: {
      provider: existing.provider,
      confidence: existing.confidence,
      asOf: existing.as_of
    }
  };
}

async function upsertFitment(db, record, existingVehicleId) {
  const vehicleId = existingVehicleId || randomUUID();

  // Upsert vehicle
  await db.query({
    text: `
      INSERT INTO vehicle (id, year, make, model, trim)
      VALUES ($1::uuid, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        year = EXCLUDED.year,
        make = EXCLUDED.make,
        model = EXCLUDED.model,
        trim = COALESCE(EXCLUDED.trim, vehicle.trim)
    `,
    values: [
      vehicleId,
      record.year,
      record.make.trim(),
      record.model.trim(),
      record.trim || null
    ]
  });

  // Build notes JSON with generation info
  const notes = JSON.stringify({
    generation: record.generation || null,
    generationFile: record.generationFile || null,
    fitmentLevel: record.fitmentLevel || 'generation-baseline',
    fitmentSource: record.fitmentSource || 'generation',
    threadSize: record.fitment.threadSize || null,
    torqueNm: record.fitment.torqueNm || null,
    boltPatternImperial: record.fitment.boltPatternImperial || null,
    wheelSizes: record.fitment.oemWheelSizes || [],
    oemTireSizes: record.fitment.oemTireSizes || [],
    importedAt: new Date().toISOString()
  });

  // Upsert vehicle_fitment
  const fitmentId = randomUUID();
  await db.query({
    text: `
      INSERT INTO vehicle_fitment (
        id, vehicle_id, vehicle_modification_id,
        bolt_pattern, center_bore_mm,
        min_offset_mm, max_offset_mm,
        notes
      ) VALUES (
        $1::uuid, $2::uuid, NULL,
        $3, $4,
        $5, $6,
        $7
      )
      ON CONFLICT (vehicle_id, vehicle_modification_id) DO UPDATE SET
        bolt_pattern = EXCLUDED.bolt_pattern,
        center_bore_mm = EXCLUDED.center_bore_mm,
        min_offset_mm = EXCLUDED.min_offset_mm,
        max_offset_mm = EXCLUDED.max_offset_mm,
        notes = EXCLUDED.notes
      RETURNING id
    `,
    values: [
      fitmentId,
      vehicleId,
      record.fitment.boltPattern,
      record.fitment.centerBoreMm || null,
      record.fitment.offsetMinMm || null,
      record.fitment.offsetMaxMm || null,
      notes
    ]
  });

  // Get the actual fitment ID (in case of conflict)
  const { rows: fitRows } = await db.query({
    text: `SELECT id FROM vehicle_fitment WHERE vehicle_id = $1::uuid AND vehicle_modification_id IS NULL`,
    values: [vehicleId]
  });
  const actualFitmentId = fitRows[0]?.id;

  if (actualFitmentId) {
    // Upsert fitment source
    await db.query({
      text: `
        INSERT INTO vehicle_fitment_source (
          id, vehicle_fitment_id, provider, source_record_timestamp, as_of, confidence, quality
        ) VALUES (
          $1::uuid, $2::uuid, $3, $4, NOW(), $5, $6
        )
        ON CONFLICT (vehicle_fitment_id, provider) DO UPDATE SET
          source_record_timestamp = EXCLUDED.source_record_timestamp,
          as_of = EXCLUDED.as_of,
          confidence = EXCLUDED.confidence,
          quality = EXCLUDED.quality
      `,
      values: [
        randomUUID(),
        actualFitmentId,
        `GENERATION_SEED_${record.fitmentSource || 'generation'}`.toUpperCase(),
        record.metadata?.importedAt || null,
        record.metadata?.confidence || 0.85,  // Default confidence for generation baseline
        record.fitmentLevel || 'generation-baseline'
      ]
    });

    // Upsert OEM tire sizes
    const tireSizes = Array.from(new Set((record.fitment.oemTireSizes || []).filter(Boolean)));
    
    // Clear existing and insert new
    await db.query({
      text: `DELETE FROM vehicle_oem_tire_size WHERE vehicle_id = $1::uuid AND vehicle_modification_id IS NULL`,
      values: [vehicleId]
    });

    for (const size of tireSizes) {
      await db.query({
        text: `
          INSERT INTO vehicle_oem_tire_size (id, vehicle_id, vehicle_modification_id, size, position)
          VALUES ($1::uuid, $2::uuid, NULL, $3, 'all')
        `,
        values: [randomUUID(), vehicleId, size]
      });
    }
  }

  return { vehicleId, fitmentId: actualFitmentId };
}

module.exports = { adminFitmentRouter };
