param(
  [string]$Url = "https://shop.warehousetiredirect.com/api/warmup",
  [int]$TimeoutSec = 20,
  [int]$RetryDelayMs = 800
)

$ErrorActionPreference = "Stop"

function Invoke-Warmup([string]$u) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $res = Invoke-WebRequest -Uri $u -Method GET -UseBasicParsing -TimeoutSec $TimeoutSec
    $sw.Stop()
    return [pscustomobject]@{
      ok = $true
      status = [int]$res.StatusCode
      ms = [int]$sw.ElapsedMilliseconds
    }
  } catch {
    $sw.Stop()
    return [pscustomobject]@{
      ok = $false
      status = 0
      ms = [int]$sw.ElapsedMilliseconds
      error = $_.Exception.Message
    }
  }
}

$r1 = Invoke-Warmup $Url
if ($r1.ok -and $r1.status -ge 200 -and $r1.status -lt 300) {
  Write-Output ("WARMUP_OK status={0} ms={1} url={2}" -f $r1.status, $r1.ms, $Url)
  exit 0
}

Start-Sleep -Milliseconds $RetryDelayMs
$r2 = Invoke-Warmup $Url
if ($r2.ok -and $r2.status -ge 200 -and $r2.status -lt 300) {
  Write-Output ("WARMUP_OK_RETRY status={0} ms={1} url={2}" -f $r2.status, $r2.ms, $Url)
  exit 0
}

Write-Output ("WARMUP_FAIL status1={0} ms1={1} err1={2} status2={3} ms2={4} err2={5} url={6}" -f $r1.status, $r1.ms, $r1.error, $r2.status, $r2.ms, $r2.error, $Url)
exit 1
