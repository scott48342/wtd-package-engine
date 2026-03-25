# Backup Clawdbot session transcripts with timestamp
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$src = 'C:\Users\Scott-Pc\.clawdbot\agents\main\sessions'
$dst = 'C:\Users\Scott-Pc\clawd\chat-backups'

# Ensure destination exists
if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
}

$files = Get-ChildItem "$src\*.jsonl" -ErrorAction SilentlyContinue
$count = 0

foreach ($file in $files) {
    $newName = "$($file.BaseName)_$ts.jsonl"
    Copy-Item $file.FullName -Destination "$dst\$newName" -Force
    $count++
}

Write-Output "BACKUP_OK count=$count timestamp=$ts"
