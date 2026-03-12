# tireconnect-scrape/ (Tire supplier adapter — INTERIM ONLY)

This will be an interim TireSupplierAdapter implementation that uses a web session/scraping approach.

Policy:
- Allowed for MVP bridging only.
- Must be replaceable without changing the package engine.
- Keep scraping quirks inside the adapter; return normalized `TireProduct` models.
