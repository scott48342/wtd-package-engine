$makes = @(
    @{make="Ford"; models=@("F-150","Mustang","Explorer","Ranger","Taurus","Focus","Escape")},
    @{make="Chevrolet"; models=@("Silverado 1500","Camaro","Tahoe","Impala","Malibu","Corvette","Blazer")},
    @{make="Toyota"; models=@("Camry","Corolla","Tacoma","4Runner","Tundra","RAV4","Highlander")},
    @{make="Honda"; models=@("Accord","Civic","CR-V","Pilot","Odyssey")},
    @{make="Dodge"; models=@("Ram 1500","Charger","Challenger","Durango","Caravan")},
    @{make="Jeep"; models=@("Wrangler","Grand Cherokee","Cherokee","Liberty")},
    @{make="BMW"; models=@("3 Series","5 Series","X5","X3")},
    @{make="Nissan"; models=@("Altima","Maxima","Frontier","Pathfinder","Sentra")},
    @{make="GMC"; models=@("Sierra 1500","Yukon","Envoy")},
    @{make="Volkswagen"; models=@("Jetta","Passat","Golf","Beetle")}
)

$vehicles = @()
$random = New-Object System.Random

for ($i = 0; $i -lt 20; $i++) {
    $year = $random.Next(1995, 2016)
    $makeObj = $makes[$random.Next($makes.Count)]
    $model = $makeObj.models[$random.Next($makeObj.models.Count)]
    $vehicles += @{year=$year; make=$makeObj.make; model=$model}
}

Write-Host "Querying 20 random vehicles (1995-2015)...`n"

$results = @()
$baseUrl = "https://shop.warehousetiredirect.com/api/debug/wheelsize-raw"

foreach ($v in $vehicles) {
    Write-Host "  $($v.year) $($v.make) $($v.model)..." -NoNewline
    $url = "$baseUrl`?year=$($v.year)&make=$($v.make)&model=$([uri]::EscapeDataString($v.model))"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
        if ($response.vehicleData) {
            Write-Host " OK ($($response.allModificationsCount) mods)"
            $results += [PSCustomObject]@{
                Year = $v.year
                Make = $response.resolved.makeSlug
                Model = $response.resolved.modelSlug
                ModificationID = $response.vehicleData.slug
                Trim = $response.vehicleData.trim
                TrimLevels = ($response.vehicleData.trim_levels -join "; ")
            }
        } else {
            Write-Host " NO DATA"
            $results += [PSCustomObject]@{
                Year = $v.year
                Make = $v.make
                Model = $v.model
                ModificationID = "N/A"
                Trim = "N/A"
                TrimLevels = "N/A"
            }
        }
    } catch {
        Write-Host " ERROR: $_"
        $results += [PSCustomObject]@{
            Year = $v.year
            Make = $v.make
            Model = $v.model
            ModificationID = "ERROR"
            Trim = $_.ToString().Substring(0, [Math]::Min(50, $_.ToString().Length))
            TrimLevels = ""
        }
    }
    Start-Sleep -Milliseconds 300
}

$outputPath = "wheelsize-20-random-vehicles.csv"
$results | Export-Csv -Path $outputPath -NoTypeInformation -Encoding UTF8

Write-Host "`n=========================================="
Write-Host "Results saved to: $outputPath"
Write-Host "=========================================="
$results | Format-Table -AutoSize
