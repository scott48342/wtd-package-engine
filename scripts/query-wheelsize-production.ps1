$vehicles = @(
    @{year=2024; make="Ford"; model="F-150"},
    @{year=2024; make="Chevrolet"; model="Silverado 1500"},
    @{year=2024; make="Ram"; model="1500"},
    @{year=2024; make="Jeep"; model="Wrangler"},
    @{year=2024; make="Toyota"; model="Tacoma"},
    @{year=2024; make="Toyota"; model="Camry"},
    @{year=2024; make="Honda"; model="Accord"},
    @{year=2024; make="BMW"; model="3 Series"},
    @{year=2024; make="Ford"; model="Mustang"},
    @{year=2024; make="Chevrolet"; model="Corvette"}
)

$results = @()
$baseUrl = "https://shop.warehousetiredirect.com/api/debug/wheelsize-raw"

foreach ($v in $vehicles) {
    Write-Host "Querying: $($v.year) $($v.make) $($v.model)..."
    $url = "$baseUrl`?year=$($v.year)&make=$($v.make)&model=$($v.model)"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
        $results += $response
        Write-Host "  OK - $($response.allModificationsCount) modifications found"
    } catch {
        Write-Host "  ERROR: $_"
        $results += @{
            query = $v
            error = $_.ToString()
        }
    }
    Start-Sleep -Milliseconds 500
}

$output = @{
    generatedAt = (Get-Date).ToString("o")
    totalVehicles = $vehicles.Count
    successCount = ($results | Where-Object { $_.vehicleData }).Count
    vehicles = $results
}

$outputPath = "wheelsize-raw-results.json"
$output | ConvertTo-Json -Depth 20 | Out-File -FilePath $outputPath -Encoding utf8
Write-Host "`nResults saved to: $outputPath"
