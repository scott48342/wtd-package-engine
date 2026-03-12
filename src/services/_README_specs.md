# Spec-table usage notes (implementation)

- `wheel_spec` is upserted from Wheel Pros wheel record properties.
- `tire_spec` / `tire_size` are implemented via TireSizeService but not fully wired until tire adapters are added.

Next steps:
- When tire adapters are added, persist:
  - `product` + `supplier_product_map`
  - `tire_size` (upsert by size)
  - `tire_spec` (FK to tire_size)
  - inventory + pricing snapshots
