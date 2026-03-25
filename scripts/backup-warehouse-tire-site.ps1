$root = 'C:\Users\Scott-Pc\clawd'
$src  = Join-Path $root 'warehouse-tire-site'
$dstDir = Join-Path $root 'chat-backups'
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $dstDir ("warehouse-tire-site-backup-$ts.zip")
if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path (Join-Path $src '*') -DestinationPath $out -Force
Write-Output $out
