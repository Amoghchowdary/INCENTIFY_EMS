param(
  [string]$Url = "https://script.google.com/macros/s/AKfycbxXvyGi6PCfBMC0Tza9FK_s6P4ii6vRXJlRZR2o1iaJd5Hu00VCCefABW0Tca_kSlM8/exec"
)
$ErrorActionPreference = 'Stop'
$url = $Url.Trim()
if (-not ($url -match '^https://script\.google\.com/macros/s/.+/exec$')) { throw 'Use the V21 Apps Script /exec URL.' }

function Invoke-WithRetry([scriptblock]$Action, [string]$Name) {
  $last = $null
  for ($i = 1; $i -le 4; $i++) {
    try { return & $Action } catch {
      $last = $_
      if ($i -lt 4) {
        Write-Host "$Name transient failure $i/4; retrying..." -ForegroundColor Yellow
        Start-Sleep -Milliseconds (250 * $i)
      }
    }
  }
  throw $last
}

function Assert-V21HealthObject($obj, [string]$Transport) {
  if ($null -eq $obj) { throw "$Transport returned an empty payload." }
  if (-not $obj.success) { throw "$Transport returned success=false." }
  if ([string]$obj.service -ne 'INCENTIFY EMS V21 Cloud API') { throw "$Transport returned unexpected service: $($obj.service)" }
  if ([string]$obj.version -ne '21.0.0') { throw "$Transport returned version $($obj.version), expected 21.0.0." }
  if ([string]$obj.release -ne '21.0.0') { throw "$Transport returned release $($obj.release), expected 21.0.0." }
  if ([string]$obj.status -ne 'ONLINE') { throw "$Transport returned status $($obj.status), expected ONLINE." }
  if ([string]$obj.mutationRetrySafety -ne 'PERSISTENT_REQUEST_REPLAY') { throw "$Transport mutation replay safety is not enabled." }
  if ([string]$obj.latencyProfile -ne 'FAST_PATH_V6_ADMIN_FACE_CONTROL') { throw "$Transport latency profile is not FAST_PATH_V6_ADMIN_FACE_CONTROL." }
  if ([string]$obj.publicBaseUrl -ne 'https://amoghchowdary.github.io/INCENTIFY_EMS') { throw "$Transport public GitHub Pages base is incorrect: $($obj.publicBaseUrl)" }
}

Write-Host '1/3 Health...' -ForegroundColor Cyan
$h = Invoke-WithRetry { Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop } 'Health'
Assert-V21HealthObject $h 'Health'
Write-Host ('PASS: Health | version=' + [string]$h.version + ' | latency=' + [string]$h.latencyProfile) -ForegroundColor Green

$json = '{"action":"health","requestId":"ems21_POWERSHELL_BACKEND_TEST_1234567890"}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$payload = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')

Write-Host '2/3 JSONP primary...' -ForegroundColor Cyan
$cb = "__incentify_ems_v21_cb_TEST_$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$r = Invoke-WithRetry {
  Invoke-WebRequest -Uri "${url}?api=1&callback=$cb&payload=$payload&v=21.0.0&transport=jsonp&_=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -UseBasicParsing -ErrorAction Stop
} 'JSONP'
if ($r.StatusCode -ne 200) { throw ('V21 JSONP transport returned HTTP ' + $r.StatusCode + '.') }
$prefix = $cb + '('
if (-not $r.Content.StartsWith($prefix)) { throw 'V21 JSONP callback contract failed.' }
$inner = $r.Content.Substring($prefix.Length)
if ($inner.EndsWith(');')) { $inner = $inner.Substring(0, $inner.Length - 2) }
elseif ($inner.EndsWith(')')) { $inner = $inner.Substring(0, $inner.Length - 1) }
try { $jp = $inner | ConvertFrom-Json } catch { throw 'V21 JSONP payload was not valid JSON.' }
Assert-V21HealthObject $jp 'JSONP'
Write-Host ('PASS: JSONP primary | serverMs=' + [string]$jp.serverMs) -ForegroundColor Green

Write-Host '3/3 JSON fallback...' -ForegroundColor Cyan
$j = Invoke-WithRetry {
  Invoke-RestMethod -Uri "${url}?api=1&payload=$payload&v=21.0.0&transport=json&_=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Method Get -ErrorAction Stop
} 'JSON'
Assert-V21HealthObject $j 'JSON'
Write-Host ('PASS: JSON fallback | serverMs=' + [string]$j.serverMs) -ForegroundColor Green

Write-Host ''
Write-Host 'INCENTIFY EMS V21 FRONTEND / V21 BACKEND VERIFIED' -ForegroundColor Green
