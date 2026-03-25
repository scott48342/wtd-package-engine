Set-Location 'C:\Users\Scott-Pc\clawd'
$patterns = @('sidebar','btn','button','outline','border','red','#ff','#f00')
$paths    = @('wtd-sandbox-ui','warehouse-tire-site','src')
foreach ($p in $paths) {
  if (Test-Path $p) {
    Get-ChildItem $p -Recurse -Directory -Filter node_modules | ForEach-Object {
      # nothing; just ensure we know it exists
    } | Out-Null

    Get-ChildItem $p -Recurse -File -Include *.css,*.scss,*.sass,*.less,*.tsx,*.ts,*.jsx,*.js,*.html |
      Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\dist\\' -and $_.FullName -notmatch '\\build\\' } |
      Select-String -Pattern $patterns -SimpleMatch |
      Select-Object -First 200
  }
}
