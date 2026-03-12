# fitment/

Fitment provider adapters and normalization.

## Interface: FitmentProviderAdapter
Required:
- `getCapabilities(): { mode: "api"|"dataset", supportsVinLookup: boolean }`
- `resolveVehicle(input): Promise<VehicleRecord>` (optional for MVP if you already have vehicle selection)
- `getFitment(vehicleKey): Promise<VehicleFitment>`

Where `VehicleFitment` is the normalized output contract consumed by the package engine:
- bolt pattern
- center bore
- wheel diameter range
- wheel width range
- offset range
- OEM tire sizes

## MVP provider options
- **Wheel-Size API** (primary MVP provider)
- **Self-managed dataset** (CSV/DB; secondary)

Scraped/hand-curated fitment data policy:
- Temporary/bootstrap only (to cover gaps while onboarding).
- Not the preferred production source.
- Keep all scraping quirks inside the dataset provider.

Provider-specific fields must not leak outside this layer.
