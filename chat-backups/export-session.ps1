$src = 'C:\Users\Scott-Pc\.clawdbot\agents\main\sessions\6c428e53-70f9-4be5-8558-d2eb8b44ee37.jsonl'
$outDir = 'C:\Users\Scott-Pc\clawd\chat-backups'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir 'webchat-2026-03-14-2135-export.md'

$lines = Get-Content -Path $src -Encoding UTF8
$sb = New-Object System.Text.StringBuilder
$null = $sb.AppendLine('# Chat export')
$null = $sb.AppendLine('Source: ' + $src)
$null = $sb.AppendLine('')

foreach ($l in $lines) {
  if ([string]::IsNullOrWhiteSpace($l)) { continue }
  try { $o = $l | ConvertFrom-Json -ErrorAction Stop } catch { continue }
  if ($o.type -ne 'message') { continue }
  $role = $o.message.role
  $content = $o.message.content
  $textParts = @()
  foreach ($c in $content) {
    if ($c.type -eq 'text') { $textParts += $c.text }
  }
  if ($textParts.Count -eq 0) { continue }

  $null = $sb.AppendLine('## ' + $role)
  $null = $sb.AppendLine(($textParts -join "`n").Trim())
  $null = $sb.AppendLine('')
}

[IO.File]::WriteAllText($out, $sb.ToString(), [Text.Encoding]::UTF8)
Write-Output $out
