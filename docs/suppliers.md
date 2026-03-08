# Suppliers & integrations

## Wheels

### Wheel Pros (API)
- Adapter: `src/adapters/wheelpros/WheelProsAdapter.js`
- Helper client: `src/adapters/wheelpros/wheelprosClient.js`
- Persisted tables (current behavior):
  - `product`, `supplier_product_map`, `wheel_spec`, `product_inventory`, `product_price`

## Tires

### TireConnect (interim scrape)
- Adapter: `src/adapters/tires/TireConnectScrapeAdapter.js`
- Data source: TireConnect in-store widget results pages (scrape)
- Persisted tables (current behavior):
  - `product`, `supplier_product_map`, `tire_spec`, `tire_size`, `product_inventory`, `product_price`

Notes:
- Scrape adapter is MVP-only; replace with API/feed vendor when available.

## Fitment

### Wheel-Size (API)
- Adapter: `src/adapters/fitment/WheelSizeFitmentAdapter.js`
- Helper client: `src/adapters/fitment/wheelSizeClient.js`
- Auth: `user_key` query param
- Base URL: `https://api.wheel-size.com/v2`
