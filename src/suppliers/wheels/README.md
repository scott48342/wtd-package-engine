# suppliers/wheels/

Wheel supplier adapters.

## Interface: WheelSupplierAdapter
Required:
- `getCapabilities()`
- `searchWheels(query)`
- `getWheelDetails(sku)`

Optional:
- `getAvailability(...)`
- `getPricing(...)`

## Implementations
- `wheelpros/` (first adapter)
- future suppliers should follow the same adapter pattern
