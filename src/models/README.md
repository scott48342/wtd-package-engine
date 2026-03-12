# models/

Normalized domain models used across the system.

Goal: the package engine depends ONLY on these models, not on supplier-specific payloads.

Suggested models:
- `ProductIdentity` (supplier, externalSku, internalProductId)
- `WheelProduct`
- `TireProduct`
- `InventorySnapshot`
- `PriceQuote`
- `VehicleFitment` (normalized fitment output contract)
- `PackageRecommendation` (includes ranking inputs)

Implementation can be plain JS objects + Zod schemas (or TypeScript types later).
