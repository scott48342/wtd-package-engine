# Fitment rules (MVP)

## Normalized fitment contract (what the engine consumes)
From `FitmentService.getFitmentForVehicle()`:
- `boltPattern`
- `centerBoreMm`
- `wheelDiameterRangeIn: [min,max]`
- `wheelWidthRangeIn: [min,max]`
- `offsetRangeMm: [min,max]`
- `oemTireSizes: string[]`

## Plus-sizing / tire diameter tolerance
Package recommendations compare a candidate tire’s overall diameter against a **base tire size**:
- base size = `preferences.tireSize` OR `preferences.size` OR `fitment.fitment.oemTireSizes[0]`

Current thresholds (see `PackageEngineService`):
- **Warn** if overall diameter difference > **3.0%**
- **Fail** if overall diameter difference > **5.0%**

## Notes
- Geometry is computed by `TireSizeService`.
- Wheel bolt pattern constraints should be applied via wheel search filters and/or later explicit validation.
