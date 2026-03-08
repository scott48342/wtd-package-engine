# Prompts (for future sessions)

## Reset / resume prompt
Copy/paste into Telegram:

"Reset context. Restart from checkpoint.\n\nCheckpoint: wtd-package-engine. Resume from repo + latest commits. Wheel-Size adapter+client done (de90599). Architecture cleanup done (6a3d1e6): PackageEngineService injects tireSizeService directly; Wheel-Size env vars normalized to WHEEL_SIZE_BASE_URL/WHEEL_SIZE_API_KEY with back-compat WHEELSIZE_*; wheels.routes.js coerces numeric params. Next: wire WheelSizeFitmentAdapter into FitmentService persistence + DB caching (vehicle_fitment + OEM tire sizes)."

## Task prompt template (keep small)

"Task: <one thing>.\nConstraints: <3-6 bullets>.\nOutput: <files changed + summary>."
