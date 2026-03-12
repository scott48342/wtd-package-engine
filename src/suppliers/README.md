# suppliers/

Supplier adapters implement **normalized interfaces** so the package engine doesn't care where data comes from.

Design principle:
- The package recommendation engine depends only on **normalized search + details + availability + pricing**.
- Whether the supplier is **API/feed-based** or **scraped via a web session** is hidden behind the adapter.

## Interfaces (MVP)

### WheelSupplierAdapter (multi-supplier)
Required methods:
- `getCapabilities()`
- `searchWheels(query): Promise<WheelSearchResult>`
- `getWheelDetails(sku): Promise<WheelDetails>`

Optional methods:
- `getAvailability(...)`
- `getPricing(...)`

Wheel Pros is just the first implementation of this interface.

### TireSupplierAdapter (supports API/feed + interim scraping)
A single adapter interface that supports both:
- **Preferred**: vendor API or data feed + availability/pricing endpoints
- **Interim**: session/cookie/web automation (e.g. TireConnect portal scraping)

Required methods:
- `getCapabilities(): { mode: "api"|"feed"|"scrape", supportsRealtimeInventory: boolean, supportsOrdering: boolean }`
- `searchTires(query): Promise<TireSearchResult>`
- `getTireDetails(sku): Promise<TireDetails>`

Optional methods (recommended):
- `getAvailability(input): Promise<AvailabilityResult>`
- `getPricing(input): Promise<PricingResult>`

### Key idea: normalized outputs
The adapter must return normalized objects (your shapes), even if the underlying source is messy.

### Interim scraping policy
- TireConnect scraping is **allowed as an interim adapter only**.
- Treat it as a replaceable module. Do not let scraper quirks leak into package-engine logic.

Implementation notes:
- Keep auth/token/session handling inside the adapter.
- Adapters should be pure (no Express). Express routes call services; services call adapters.
