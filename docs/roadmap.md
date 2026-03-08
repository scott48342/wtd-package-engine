# Roadmap

## Next (highest priority)
1) Fitment persistence verification
- Ensure Wheel-Size adapter results are persisted to:
  - `vehicle_fitment`, `vehicle_fitment_source`, `vehicle_oem_tire_size`
- Add DB-backed caching TTL configuration for sandbox limits.

2) Recommendation quality
- Improve wheel+tire pairing logic beyond index-based pairing.
- Use wheel diameter to filter tire candidates.

## Soon
3) Replace TireConnect scrape adapter
- Move to a real tire vendor API/feed.

4) Fitment validation endpoint
- `/v1/fitment/validate` using stored fitment + spec tables.

## Later
5) Pricing rules engine
- Markups, MAP constraints, package discounts.

6) Ordering
- Supplier ordering workflows.
