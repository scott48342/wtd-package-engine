$p = 'C:\Users\Scott-Pc\clawd\chat-backups\webchat-2026-03-14-2135-export.md'
$txt = Get-Content -Raw -Encoding UTF8 -Path $p

$head = @'
# Where we left off (summary)

- We identified WheelPros SFTP feeds as the fastest path to instant wheel/tire results (inventory + wheel SKUs + tire SKUs).
- We set up a GitHub Actions workflow/job to pull the latest SFTP files on a schedule and import them into a Postgres database hosted on Railway.
- The app should query Railway Postgres for quick SKU/availability/price lookups instead of waiting on live API calls.
- Current blocker today: the import job is hitting a hard 30-minute execution limit and gets canceled mid-run; we need to either increase the workflow timeout and/or switch to faster bulk loads (staging tables + COPY) with checkpoint/resume.

Next steps when we resume:
1) Open the GitHub Actions workflow YAML and check `timeout-minutes` + step timings.
2) Confirm which files are being pulled (names, sizes) and current batch/row counts.
3) Adjust importer to use bulk load (COPY) + upsert, and/or split into per-file chunks so each run finishes <30 minutes.
4) Verify Railway Postgres connection settings (SSL, pooler) and that imports are writing where the app reads.
'@

if ($txt -notmatch '^# Where we left off') {
  Set-Content -Encoding UTF8 -Path $p -Value ($head + "`r`n" + $txt)
}

Write-Output $p
