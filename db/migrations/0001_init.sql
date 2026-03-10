-- 0001_init.sql
-- Initial schema for WTD package engine

-- NOTE: In real projects, wrap in transaction and add down migrations.

\ir ../schema.sql
\ir ./0002_vehicle_trims_fitment.sql
