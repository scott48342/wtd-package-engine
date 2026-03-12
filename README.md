# WTD Package Engine (Express + Postgres)

Backend service that recommends wheel+tire packages.

## Setup

1) Copy env template:
```bat
cd C:\Users\Scott-Pc\clawd\wtd-package-engine
copy .env.example .env
```

2) Fill in required values in `.env`:
- `DATABASE_URL`
- Wheel Pros (wheels): `WHEELPROS_USERNAME`, `WHEELPROS_PASSWORD`, etc.
- Wheel-Size (fitment): `WHEEL_SIZE_API_KEY` (auth via `user_key` query param)
- TireConnect (tires, interim scrape): `TIRECONNECT_WIDGET_ID`, `TIRECONNECT_LOCATION_ID`

3) Install deps:
```bat
npm install
```

4) Apply schema/migrations to Postgres (see `db/schema.sql` + `db/migrations/`).

5) Run:
```bat
npm run dev
```

## Notes
- `.env` is ignored by git (see `.gitignore`). Don’t commit secrets.
- Fitment caching is DB-backed via `vehicle_fitment` + `vehicle_fitment_source.as_of` (TTL enforced in `FitmentService`).
