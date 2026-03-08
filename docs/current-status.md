# Current status

Last known good commits:
- `de90599` — Wheel-Size fitment adapter + helper client (`wheelSizeClient.js`, `WheelSizeFitmentAdapter.js`)
- `6a3d1e6` — Architecture cleanup:
  - inject `tireSizeService` directly into `PackageEngineService`
  - normalize env vars to `WHEEL_SIZE_BASE_URL` / `WHEEL_SIZE_API_KEY` (with back-compat `WHEELSIZE_*`)
  - coerce numeric wheel search query params in `wheels.routes.js`

## Working features (MVP)

- `/v1/wheels/search` calls WheelPros and persists:
  - `product`, `supplier_product_map`, `wheel_spec`, `product_inventory`, `product_price`
- Tires are fetched via TireConnect scrape adapter (interim) and persisted:
  - `product`, `supplier_product_map`, `tire_spec`, `tire_size`, `product_inventory`, `product_price`
- `/v1/packages/recommend`:
  - pulls wheels + tires
  - compares tire overall diameter vs base/OEM size and emits warnings/failures

## Known gaps

- Fitment persistence path is not fully verified end-to-end with Wheel-Size (needs DB population of `vehicle_fitment` + `vehicle_oem_tire_size` in normal flow).
- No ordering workflow.
- Repo hygiene: ensure everything under `wtd-package-engine/` is tracked/committed (except `.env`, `node_modules`).
