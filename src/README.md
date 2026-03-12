# src/

This directory is a placeholder for the Node.js/Express implementation.

Suggested module layout:
- `app.js` (Express app wiring)
- `server.js` (listen + boot)
- `config/` (env parsing)
- `db/` (pg pool + migrations)
- `models/` (normalized domain models)
- `mappings/` (supplier-specific mappings)
- `services/` (auth, wheels, tires, fitment, packages, pricing)
- `suppliers/`
  - `wheels/` (wheel supplier adapters; WheelPros is one implementation)
  - `tires/` (tire supplier adapters; API/feed preferred; TireConnect scrape interim)
- `fitment/` (fitment provider adapters; Wheel-Size API or self-managed dataset)
- `routes/` (Express routers)
- `schemas/` (request validation)

