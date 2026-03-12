# Architecture (MVP → scalable)

## High-level components

### 1) API Gateway (Express)
Single public HTTP API surface for your website(s). Routes to internal modules/services.

### 2) Auth service
- Purpose: protect your internal endpoints (admin, pricing rules, supplier calls).
- MVP: API key or JWT-based sessions.
- Later: multi-tenant (shops, franchises), role-based permissions.

### 3) Catalog services

#### Wheel service (multi-supplier)
Responsibilities:
- Define a common interface (`WheelSupplierAdapter`) for search + details + (optional) availability + (optional) pricing
- Support multiple wheel suppliers behind the same adapter pattern
- Normalize supplier responses into internal `WheelProduct` models
- Cache results (DB + optional Redis) to reduce vendor calls
- Provide SKU details lookup

Wheel suppliers supported via adapters:
- **Wheel Pros** (first implementation)
- Future: additional wheel wholesalers/manufacturers

#### Tire service (multi-supplier)
Responsibilities:
- Define a common interface (`TireSupplierAdapter`) for search + (optional) availability + (optional) pricing
- Support **two integration modes** behind the same adapter interface:
  - **Preferred**: API/feed-based suppliers
  - **Interim only**: scraped/web-session-based suppliers (e.g. TireConnect portal)
- Normalize supplier responses into internal `TireProduct` models
- Store supplier metadata + mapping (supplier SKU → internal SKU)
- Ensure the package engine never sees scraper-specific fields/quirks

### 4) Fitment service (provider-agnostic)
Responsibilities:
- Vehicle selection: year/make/model/submodel/trim/engine (and optionally VIN)
- Resolve vehicle fitment constraints via a **FitmentProviderAdapter**
- Persist/cache normalized fitment outputs so the package engine has a stable shape
- Compute compatibility between candidate wheels/tires and vehicle constraints

FitmentProviderAdapters (MVP → scale):
- **Wheel-Size API** (primary MVP provider; API-based)
- **Self-managed fitment dataset** (secondary; manually curated/bootstrap)
- Future: other licensed fitment providers

Scraped/hand-curated fitment data policy:
- Allowed for bootstrap only.
- Not the preferred long-term production source.
- Must be replaceable without changing the package engine (adapter swap only).

Hard rule: Fitment service must be provider-agnostic; provider-specific quirks stay in the adapter.

Normalized fitment output contract (what the package engine consumes):
- bolt pattern
- center bore
- wheel diameter range
- wheel width range
- offset range
- OEM tire sizes

### 5) Package engine service (supplier-agnostic)
Responsibilities:
- Given a vehicle + preferences, generate candidate packages from **normalized wheel + tire interfaces**:
  - wheel SKU(s)
  - tire SKU(s)
  - quantities, TPMS compatibility flags, hardware needs
- Validate:
  - bolt pattern match
  - diameter/width/offset rules
  - load rating/speed rating constraints (tires)
  - stock constraints

Hard rule: the package engine must never depend on Wheel Pros (or any vendor) directly.
It only consumes `WheelSupplierAdapter` and `TireSupplierAdapter` results.

### 6) Pricing service
Responsibilities:
- Compute sell price from supplier cost + rules:
  - markup tables by brand/category
  - MAP/MSRP constraints
  - promotions
  - package discounts
- Persist pricing snapshots (important for quotes)

## Internal product identity (important)
Use a stable internal identity so the package engine is supplier-agnostic.

Recommended identity tuple:
- `supplier` (e.g. WHEELPROS)
- `externalSku` (supplier SKU)
- `internalProductId` (UUID; stable internal identity)

Supplier adapters return `{supplier, externalSku}` and the system resolves/creates `internalProductId` via `supplier_product_map`.
If you also maintain a human-readable internal SKU, store it as `product.internal_sku`.

---

## Data flow: package recommendation
1) Client chooses Vehicle (or VIN → vehicle)
2) Client sets constraints (wheel diameter, finish, tire season, budget)
3) API calls:
   - Fitment service to fetch vehicle specs (via FitmentProviderAdapter)
   - Wheel service to get candidate wheels (WheelSupplierAdapter)
   - Tire service to get candidate tires (TireSupplierAdapter)
4) Package engine:
   - generate combinations
   - validate fitment
   - compute pricing
   - compute ranking inputs (margin, stock confidence, shipping speed, supplier priority)
5) Return top packages + explanation fields (why selected)

---

## MVP assumptions
- Wheel suppliers are adapter-based. Wheel Pros is the first adapter.
- Tire supplier path is **API/feed-first** (long-term). A TireConnect scraper adapter may exist **temporarily**.
- Fitment DB starts small and grows (or is licensed).
- Ordering is out of scope for now (quotes first).

## Replaceability guarantee (important)
The **package engine** must depend only on normalized interfaces and data shapes. That lets you replace an interim scraper
with a real vendor API/feed later without changing package generation logic—only the adapter implementation.

