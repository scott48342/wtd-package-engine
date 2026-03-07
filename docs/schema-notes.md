# Schema notes / clarifications

## Product identity
- `product.id` is the stable internal product identity and corresponds to API `internalProductId`.
- `supplier_product_map` maps `(supplier_id, supplier_sku)` → `internal_product_id`.
- `product.internal_sku` is optional and is for a stable human-readable internal SKU.
- Avoid storing supplier SKUs directly as `product.internal_sku` unless you *intend* them to be internal.

## Fitment providers vs suppliers
Fitment providers are stored in `fitment_provider` / `fitment_provider_credential` rather than in `supplier`.
Reason: fitment is a different integration surface (different credentials + provenance + caching concerns) and keeping it separate
reduces accidental coupling.

## Fitment provenance
- `vehicle_fitment` stores normalized constraints.
- `vehicle_fitment_source` stores provenance per provider (provider code, vendor record timestamp if known, confidence/quality).

## Structured specs for search
To support fast filtering and plus-sizing logic, structured spec tables exist:
- `wheel_spec` (indexed wheel properties)
- `tire_spec` (indexed tire properties)
- `tire_size` (computed tire geometry: diameter/circumference/revs-per-mile)

These are derived/normalized from supplier payloads and let you:
- search without depending on vendor response shape
- compare tire sizes for packages (+/- diameter tolerance)

