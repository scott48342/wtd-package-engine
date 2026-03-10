-- Warehouse Tire Direct - Package Engine (MVP)
-- PostgreSQL schema draft

-- Enable extensions you may want later
-- create extension if not exists pgcrypto;

-- ========== AUTH ==========
create table if not exists app_user (
  id                uuid primary key,
  email             text not null unique,
  password_hash     text not null,
  display_name      text,
  role              text not null default 'admin',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists api_key (
  id                uuid primary key,
  user_id           uuid not null references app_user(id) on delete cascade,
  name              text not null,
  key_hash          text not null,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now()
);

-- ========== SUPPLIERS ==========
create table if not exists supplier (
  id                uuid primary key,
  code              text not null unique, -- e.g., WHEELPROS, ATD, TIRECONNECT
  name              text not null,

  -- Supplier kind: keep this limited to product suppliers.
  -- Fitment providers are kept separate to avoid mixing different concerns/credentials.
  kind              text not null, -- wheel|tire|both

  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Fitment providers are separate from suppliers.
-- Reason: fitment has different credentials, lifecycle, and data provenance requirements.
create table if not exists fitment_provider (
  id                uuid primary key,
  code              text not null unique, -- WHEEL_SIZE_API | SELF_MANAGED_DATASET
  name              text not null,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists fitment_provider_credential (
  id                uuid primary key,
  fitment_provider_id uuid not null references fitment_provider(id) on delete cascade,
  credential_type   text not null, -- api | dataset | session
  key               text not null,
  value             text not null,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(fitment_provider_id, credential_type, key)
);

-- Per-supplier auth/config (encrypted at rest in production)
create table if not exists supplier_credential (
  id                uuid primary key,
  supplier_id       uuid not null references supplier(id) on delete cascade,

  -- credential_type lets us support API keys, feed creds, and interim session/cookie storage.
  -- Examples:
  --  - api:client_id, api:client_secret, api:base_url
  --  - feed:sftp_host, feed:sftp_user, feed:sftp_password
  --  - session:cookie_jar_json, session:csrf_token
  credential_type   text not null,  -- api | feed | session
  key               text not null,
  value             text not null,

  -- For interim scraping adapters: session creds expire.
  expires_at        timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique(supplier_id, credential_type, key)
);

-- ========== VEHICLE / FITMENT ==========
-- Fitment is resolved via FitmentProviderAdapter(s).
-- Wheel-Size API is the primary MVP provider; self-managed dataset is secondary.

create table if not exists vehicle (
  id                uuid primary key,
  year              int not null,
  make              text not null,
  model             text not null,
  submodel          text,
  trim              text,
  created_at        timestamptz not null default now()
);

create index if not exists vehicle_lookup_idx on vehicle(year, make, model);

-- Fitment constraints at a vehicle level (can be expanded to axle-level later)
-- vehicle_fitment is a normalized fitment record (not provider-specific).
-- Source/provenance is captured in vehicle_fitment_source (below).
create table if not exists vehicle_modification (
  id                uuid primary key,
  vehicle_id        uuid not null references vehicle(id) on delete cascade,
  modification      text not null, -- Wheel-Size modification slug/id
  trim              text,
  created_at        timestamptz not null default now(),
  unique(vehicle_id, modification)
);

create index if not exists vehicle_mod_vehicle_idx on vehicle_modification(vehicle_id);

create table if not exists vehicle_fitment (
  id                uuid primary key,
  vehicle_id        uuid not null references vehicle(id) on delete cascade,
  vehicle_modification_id uuid references vehicle_modification(id) on delete cascade,
  bolt_pattern      text,           -- e.g., 5x114.3
  center_bore_mm    numeric(6,2),
  min_offset_mm     numeric(6,2),
  max_offset_mm     numeric(6,2),
  min_wheel_dia_in  numeric(5,2),
  max_wheel_dia_in  numeric(5,2),
  min_wheel_w_in    numeric(5,2),
  max_wheel_w_in    numeric(5,2),
  notes             text,
  created_at        timestamptz not null default now(),
  unique(vehicle_id, vehicle_modification_id)
);

-- Fitment source persistence: record provenance per vehicle_fitment.
create table if not exists vehicle_fitment_source (
  id                uuid primary key,
  vehicle_fitment_id uuid not null references vehicle_fitment(id) on delete cascade,

  provider          text not null, -- WHEEL_SIZE_API | SELF_MANAGED_DATASET | other
  source_record_timestamp timestamptz, -- vendor/dataset record time if known
  as_of             timestamptz not null default now(),

  -- Optional quality/confidence scoring (0..1)
  confidence        numeric(3,2),
  quality           text,

  unique(vehicle_fitment_id, provider)
);

-- Optional OEM tire sizes (for suggestions)
create table if not exists vehicle_oem_tire_size (
  id                uuid primary key,
  vehicle_id        uuid not null references vehicle(id) on delete cascade,
  vehicle_modification_id uuid references vehicle_modification(id) on delete cascade,
  size              text not null, -- 265/70R17
  position          text,          -- front|rear|all
  created_at        timestamptz not null default now()
);

create index if not exists vehicle_oem_tire_size_mod_idx on vehicle_oem_tire_size(vehicle_modification_id);

-- ========== PRODUCT CACHE (normalized) ==========
-- Keep a lightweight cache to speed up repeated searches and to support quoting.

-- Supplier â†’ internal mapping. This is what keeps the package engine supplier-agnostic.
-- A single internal product can potentially map to multiple supplier SKUs over time.


-- IMPORTANT: internal product identity
-- `product.id` is the stable internal product identity (maps to API `internalProductId`).
-- `product.internal_sku` is your internal human-readable SKU/identifier (optional but recommended).
-- Supplier SKUs are stored in `supplier_product_map.supplier_sku`.

create table if not exists product (
  id                uuid primary key,
  internal_sku      text unique, -- optional stable internal SKU string
  sku_type          text not null, -- wheel|tire|accessory

  -- Default/preferred supplier mapping for this internal product (optional).
  -- Do not rely on this for uniqueness; use supplier_product_map.
  preferred_supplier_id uuid references supplier(id),
  preferred_external_sku text,

  title             text,
  brand             text,
  model             text,

  raw               jsonb not null, -- normalized snapshot payload (not necessarily vendor-native)

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists supplier_product_map (
  id                uuid primary key,
  supplier_id       uuid not null references supplier(id) on delete cascade,
  supplier_sku      text not null,

  -- Stable internal identity for the product.
  internal_product_id uuid not null references product(id) on delete cascade,

  -- Optional denormalized helper
  sku_type          text not null, -- wheel|tire|accessory

  created_at        timestamptz not null default now(),
  unique(supplier_id, supplier_sku)
);

create index if not exists supplier_product_map_internal_idx on supplier_product_map(internal_product_id);


-- ========== STRUCTURED SPECS (indexed search) ==========
-- These tables store structured, queryable fields extracted from supplier payloads.
-- They are designed for indexed search/filtering and plus-sizing comparisons.

-- Computed tire geometry for size comparison and plus-sizing.
create table if not exists tire_size (
  id                  uuid primary key,
  size                text not null unique, -- e.g., 225/60R18

  width_mm            int,
  aspect_ratio        int,
  wheel_diameter_in   numeric(5,2),

  -- computed geometry
  overall_diameter_in numeric(6,3),
  section_width_in    numeric(6,3),
  circumference_in    numeric(7,3),
  revs_per_mile       numeric(7,2),

  computed_at         timestamptz not null default now()
);

create index if not exists tire_size_whl_idx on tire_size(wheel_diameter_in);
create index if not exists tire_size_war_idx on tire_size(width_mm, aspect_ratio, wheel_diameter_in);

-- Structured wheel properties for indexed search.
create table if not exists wheel_spec (
  product_id         uuid primary key references product(id) on delete cascade,

  diameter_in        numeric(5,2),
  width_in           numeric(5,2),
  offset_mm          numeric(6,2),
  bolt_pattern       text,          -- 5x114.3
  center_bore_mm     numeric(6,2),

  finish             text,
  finish_code        text,
  model              text,

  tpms_compatible    boolean,
  load_rating_lbs    numeric(8,2),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists wheel_spec_bp_idx on wheel_spec(bolt_pattern);
create index if not exists wheel_spec_dim_idx on wheel_spec(diameter_in, width_in);
create index if not exists wheel_spec_offset_idx on wheel_spec(offset_mm);
create index if not exists wheel_spec_finish_idx on wheel_spec(finish_code);

-- Structured tire properties for indexed search.
create table if not exists tire_spec (
  product_id         uuid primary key references product(id) on delete cascade,

  tire_size_id       uuid references tire_size(id),
  size               text,          -- store original size string too for convenience

  width_mm           int,
  aspect_ratio       int,
  wheel_diameter_in  numeric(5,2),

  model              text,
  season             text,          -- all-season | winter | summer | all-weather
  load_index         int,
  speed_rating       text,
  run_flat           boolean,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists tire_spec_size_idx on tire_spec(size);
create index if not exists tire_spec_dims_idx on tire_spec(width_mm, aspect_ratio, wheel_diameter_in);
create index if not exists tire_spec_season_idx on tire_spec(season);

-- Inventory snapshot (per sku)
create table if not exists product_inventory (
  id                uuid primary key,
  product_id        uuid not null references product(id) on delete cascade,
  local_stock       int,
  global_stock      int,
  inventory_type    text,

  -- where this inventory came from
  supplier_id       uuid references supplier(id),
  source_timestamp  timestamptz,
  confidence        numeric(3,2), -- 0.00-1.00

  as_of             timestamptz not null default now()
);

-- Pricing snapshot (per sku)
create table if not exists product_price (
  id                uuid primary key,
  product_id        uuid not null references product(id) on delete cascade,
  price_type        text not null, -- msrp|map|nip|cost|sell
  currency          text not null default 'USD',
  amount            numeric(12,2) not null,
  as_of             timestamptz not null default now()
);

-- ========== QUOTES / PACKAGES ==========
create table if not exists quote (
  id                uuid primary key,
  vehicle_id        uuid references vehicle(id),
  status            text not null default 'draft',
  currency          text not null default 'USD',
  subtotal          numeric(12,2),
  tax               numeric(12,2),
  total             numeric(12,2),
  created_at        timestamptz not null default now()
);

create table if not exists quote_item (
  id                uuid primary key,
  quote_id          uuid not null references quote(id) on delete cascade,
  product_id        uuid not null references product(id),
  quantity          int not null,
  unit_price        numeric(12,2),
  line_total        numeric(12,2),
  meta              jsonb,
  created_at        timestamptz not null default now()
);

