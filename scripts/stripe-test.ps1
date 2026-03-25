$ErrorActionPreference = 'Stop'
$payload = @{
  customer = @{ firstName='Test'; lastName='User'; email='test@example.com'; phone='5555555555' }
  vehicle  = @{ year='2020'; make='Chevrolet'; model='Silverado 1500'; trim='LT' }
  items    = @(
    @{ type='wheel'; sku='AB809-22106818NGM'; model='AB809 22x10'; unitPrice=199; quantity=4 }
    @{ type='accessory'; category='lug_nut'; sku='GO-TEST-SKU'; name='Standard Lug Kit (Included)'; unitPrice=0; quantity=1; required=$true; meta=@{ nipCost=35.12; source='wheelpros' } }
    @{ type='accessory'; category='hub_ring'; sku='HR-106-78'; name='Hub Rings (Included) 106.1->78.1'; unitPrice=0; quantity=1; required=$true }
  )
}
$body = $payload | ConvertTo-Json -Depth 10
$res = Invoke-RestMethod -Method Post -Uri 'https://shop.warehousetiredirect.com/api/stripe/create-checkout-session' -ContentType 'application/json' -Body $body
$res | ConvertTo-Json -Depth 20
