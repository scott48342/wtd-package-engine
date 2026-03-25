$root = 'C:\Users\Scott-Pc\clawd'
$src  = Join-Path $root 'warehouse-tire-site'
$dstDir = Join-Path $root 'chat-backups'
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$tmp = Join-Path $root ('tmp\\warehouse-tire-site-backup-'+$ts)
$out = Join-Path $dstDir ("warehouse-tire-site-backup-lite-$ts.zip")

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# Copy source excluding heavy/generated dirs
$excludeDirs = @('node_modules','.next','dist','build','.turbo')
$excludeFiles = @('*.log')

$xd = @()
foreach ($d in $excludeDirs) { $xd += (Join-Path $src $d) }

robocopy $src $tmp /MIR /XD @($excludeDirs) /XF @($excludeFiles) /NFL /NDL /NJH /NJS /NP | Out-Null

if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $out -Force

Remove-Item $tmp -Recurse -Force
Write-Output $out
