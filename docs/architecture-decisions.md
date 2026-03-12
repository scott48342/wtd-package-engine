# Architecture decisions

## ADR-001: Adapter-based supplier/provider integrations
- **Decision:** Suppliers and fitment providers are integrated via adapters under `src/adapters/*`.
- **Why:** Keeps `PackageEngineService` and other business logic supplier-agnostic.
- **Note:** Adapter interfaces are currently **JSDoc/runtime-contract based** (see `src/adapters/interfaces.js`) — not compile-time enforced.

## ADR-002: Stable internal product identity
- **Decision:** Use internal `product.id` (UUID) as the stable identity and map supplier SKUs via `supplier_product_map`.
- **Why:** Multiple suppliers can map to one internal product and the engine remains vendor-agnostic.

## ADR-003: Structured spec tables for search and sizing
- **Decision:** Persist structured fields to `wheel_spec`, `tire_spec`, and computed geometry to `tire_size`.
- **Why:** Enables indexed search/filtering and plus-sizing comparison independent of vendor payload shapes.

## ADR-004: Inventory and pricing are snapshots
- **Decision:** Persist inventory and pricing as time-series snapshots (`product_inventory`, `product_price`).
- **Why:** Quotes and reporting need historical views and confidence/provenance.

## ADR-005: Fitment is DB-cached
- **Decision:** Fitment is persisted in `vehicle_fitment` with provenance in `vehicle_fitment_source` and OEM sizes in `vehicle_oem_tire_size`.
- **Why:** Reduce external API calls (sandbox limits) and stabilize fitment shape.
