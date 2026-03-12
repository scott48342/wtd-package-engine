# System overview (wtd-package-engine)

**Goal:** Recommend wheel + tire packages for a selected vehicle using supplier-agnostic services and adapters.

## Runtime components

- **HTTP API**: Express app (`src/app.js`) with routers under `/v1/*`
- **Services** (business logic + persistence): `src/services/*`
- **Adapters** (supplier/provider integrations): `src/adapters/*`
- **Database**: PostgreSQL schema in `db/schema.sql` (plus `db/migrations/*`)

## High-level data flow

1. Client selects a **vehicle** (by id)
2. API fetches **fitment** (Wheel-Size adapter; DB-cached). Note: fitment lookup may **upsert** a vehicle row to ensure caching has a stable vehicle id.
3. API fetches **wheel candidates** (WheelPros adapter; persisted into structured tables)
4. API fetches **tire candidates** (TireConnect scrape adapter; persisted into structured tables)
5. Package engine compares sizes (via `TireSizeService`) and returns recommendations

## Key invariants

- **Package engine must be supplier-agnostic**: vendor quirks stay inside adapters.
- **Structured spec tables** are the indexed search layer:
  - `wheel_spec`, `tire_spec`, `tire_size`
- **Price/inventory** are stored as snapshots:
  - `product_price`, `product_inventory`
