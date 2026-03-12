# API Design (v1)

Base path: `/v1`

## Status

This document includes both:
- **Implemented endpoints** (present in `src/app.js` routers today)
- **Planned endpoints** (design targets; not yet implemented)

## Implemented endpoints

### Health
- `GET /health`

### Vehicles
- `GET /v1/vehicles/makes?year=...`
- `GET /v1/vehicles/models?year=...&make=...`
- `GET /v1/vehicles/:vehicleId/fitment`

### Wheels
- `GET /v1/wheels/search`

### Packages
- `POST /v1/packages/recommend`

---

## Planned endpoints

## Auth

### POST `/v1/auth/login`
MVP: exchange API key/user+pass for a JWT.

Request:
```json
{ "email": "...", "password": "..." }
```

Response:
```json
{ "accessToken": "<jwt>", "expiresIn": 3600 }
```

### POST `/v1/auth/refresh`
Refresh token flow (optional for MVP).

### GET `/v1/auth/me`
Return authenticated user.

---

## Vehicles & Fitment

### GET `/v1/vehicles/makes?year=2020`
### GET `/v1/vehicles/models?year=2020&make=Ford`
### GET `/v1/vehicles/submodels?year=2020&make=Ford&model=F-150`
### GET `/v1/vehicles/trims?year=2020&make=Ford&model=F-150&submodel=XL`

### GET `/v1/vehicles/:vehicleId/fitment`
Returns normalized fitment constraints from the active FitmentProviderAdapter.

Optional query params:
- `provider` (e.g. `WHEEL_SIZE_API`, `SELF_MANAGED_DATASET`) — otherwise use backend default

Notes:
- `WHEEL_SIZE_API` is the primary MVP provider.
- `SELF_MANAGED_DATASET` is a secondary/bootstrap provider for gaps and manual overrides.

Response (example):
```json
{
  "vehicleId": "...",
  "fitment": {
    "boltPattern": "6x135",
    "centerBoreMm": 87.1,
    "wheelDiameterRangeIn": [17, 20],
    "wheelWidthRangeIn": [7.5, 9.0],
    "offsetRangeMm": [35, 44],
    "oemTireSizes": ["265/70R17", "275/55R20"]
  },
  "source": {
    "provider": "WHEEL_SIZE_API",
    "asOf": "2026-03-06T00:00:00Z"
  }
}
```

---

## Wheels (multi-supplier)

Wheel endpoints are supplier-agnostic. You can optionally choose a supplier; otherwise the backend uses defaults/ranking.

### GET `/v1/wheels/search`
Query params mirror your normalized search. Backend maps to the chosen supplier adapter.

Optional query params:
- `supplier` (e.g. `WHEELPROS`) — otherwise use backend defaults

Common query params:
- `vehicleId` (optional; if supplied, auto-apply bolt pattern / diameter constraints)
- `diameter`, `width`, `boltPattern`, `minOffset`, `maxOffset`, `brand`, `finish`
- `fields=inventory,price`
- `priceType=msrp,map,nip`
- `company=1500`

Response:
```json
{
  "results": [
    {
      "identity": {
        "supplier": "WHEELPROS",
        "externalSku": "ABL19-22900015MG",
        "internalProductId": "b2a1..." 
      },
      "title": "...",
      "brand": { "code": "AB", "name": "Asanti Black" },
      "properties": { "diameter": 20, "width": 9, "offsetMm": 18, "boltPattern": "5x114.3" },
      "inventory": { "local": 0, "global": 12 },
      "prices": { "msrp": { "amount": 398.0, "currency": "USD" } },
      "images": [{ "url": "..." }]
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 1234
}
```

### GET `/v1/wheels/:sku`
Returns wheel details.

Optional query params:
- `supplier` — required if the SKU namespace is not globally unique in your system.

---

## Tires (multi-supplier)

Tire endpoints are supplier-agnostic. You can optionally choose a supplier; otherwise the backend uses defaults/ranking.

### GET `/v1/tires/search`
Optional query params:
- `supplier` (e.g. `ATD`, `TIRECONNECT_SCRAPE` (interim))

Other query params:
- `vehicleId` (optional)
- `size` OR (`width`,`aspectRatio`,`wheelDiameter`)
- `season`, `brand`, `runFlat`, `loadIndexMin`, `speedRatingMin`

Response shape similar to wheels.

### GET `/v1/tires/:sku`
Supplier-specific; returns normalized details.

---

## Fitment validation

### POST `/v1/fitment/validate`
Validate a wheel+tire (or package) against a vehicle.

Request (normalized identities):
```json
{
  "vehicleId": "...",
  "wheel": {
    "identity": {
      "supplier": "WHEELPROS",
      "externalSku": "...",
      "internalProductId": "..."
    }
  },
  "tire": {
    "identity": {
      "supplier": "TIRE_VENDOR_X",
      "externalSku": "...",
      "internalProductId": "..."
    }
  }
}
```

Notes:
- `internalProductId` is preferred if present.
- If only `{supplier, externalSku}` is provided, the backend resolves/creates the internal mapping.

Response:
```json
{
  "ok": true,
  "issues": [],
  "warnings": ["offset close to max range"],
  "normalized": {
    "boltPatternOk": true,
    "centerBoreOk": true,
    "offsetOk": true,
    "diameterOk": true
  }
}
```

---

## Package generation + recommendations

### POST `/v1/packages/recommend`
Primary endpoint: returns package recommendations for a selected vehicle.

Request:
```json
{
  "vehicleId": "...",
  "preferences": {
    "wheelDiameter": 20,
    "wheelFinish": "BLACK",
    "tireSeason": "all-season",
    "budgetMax": 2500,
    "minQuantity": 4
  }
}
```

Response:
```json
{
  "vehicleId": "...",
  "recommendations": [
    {
      "score": 0.92,
      "ranking": {
        "margin": 420.00,
        "stockConfidence": 0.8,
        "shippingSpeedScore": 0.6,
        "supplierPriority": 10
      },
      "wheel": {
        "identity": { "supplier": "WHEELPROS", "externalSku": "...", "internalProductId": "..." },
        "title": "..."
      },
      "tire": {
        "identity": { "supplier": "TIRE_VENDOR_X", "externalSku": "...", "internalProductId": "..." },
        "title": "..."
      },
      "pricing": {
        "wheelUnit": 260,
        "tireUnit": 180,
        "packageSubtotal": 1760,
        "estimatedTax": 0,
        "estimatedTotal": 1760,
        "currency": "USD"
      },
      "availability": {
        "wheelMaxQty": 12,
        "tireMaxQty": 8,
        "okForMinQuantity": true
      },
      "fitment": { "ok": true, "warnings": [] }
    }
  ]
}
```

---

## Pricing

### POST `/v1/pricing/quote`
Compute pricing for a given basket.

