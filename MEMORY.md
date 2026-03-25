# Long-term Memory

- WarehouseTireDirect tires sidebar filters: K&M tireSizeSearch does not expose structured merchandising fields (run-flat/UTQG/season/etc.) beyond basic keys. Current approach (Option 1) is **heuristic filters** derived from the K&M `Description` string (e.g., RFT/EMT for run-flat, 95V/99Y for speed rating, XL, winter/all-season guesses). When a richer supplier/feed is added later, replace heuristics with proper attributes/facets.

- Backup / rollback convention (Warehouse Tire site)
  - Before major UI reworks, create:
    - a timestamped session transcript backup under `C:\Users\Scott-Pc\clawd\chat-backups\sessions-backup-YYYYMMDD-HHMMSS\`
    - a code snapshot zip under `C:\Users\Scott-Pc\clawd\chat-backups\warehouse-tire-site-backup-lite-YYYYMMDD-HHMMSS.zip` (lite excludes `node_modules`/`.next`)
    - a Git tag pushed to origin so Vercel rollbacks are easy
  - 2026-03-17 pre-visual-launcher backups:
    - Git tag: `backup-pre-visual-launcher-20260317-0954` (points to commit `a0ad5ad`)
    - Lite zip: `chat-backups\\warehouse-tire-site-backup-lite-20260317-095341.zip`
    - Session backup: `chat-backups\\sessions-backup-20260317-095104\\`
