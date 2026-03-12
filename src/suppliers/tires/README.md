# suppliers/tires/

Tire supplier adapters.

## Interface: TireSupplierAdapter
Required:
- `getCapabilities(): { mode: "api"|"feed"|"scrape", supportsRealtimeInventory: boolean, supportsOrdering: boolean }`
- `searchTires(query)`
- `getTireDetails(sku)`

Optional:
- `getAvailability(...)`
- `getPricing(...)`

## Implementations
- API/feed vendors (preferred)
- `tireconnect-scrape/` (interim only)
