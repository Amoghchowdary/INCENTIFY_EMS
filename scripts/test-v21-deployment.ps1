param(
  [string]$Url = "https://script.google.com/macros/s/AKfycbxXvyGi6PCfBMC0Tza9FK_s6P4ii6vRXJlRZR2o1iaJd5Hu00VCCefABW0Tca_kSlM8/exec"
)
$ErrorActionPreference='Stop'
$url=$Url.Trim()
if(-not($url -match '^https://script\.google\.com/macros/s/.+/exec$')){throw 'Use the V21 Apps Script /exec URL.'}

$pass=0;$fail=0;$recovered=0
for($test=1;$test -le 10;$test++){
  $ok=$false
  for($attempt=1;$attempt -le 3;$attempt++){
    try{
      $r=Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
      if($r.success -eq $true -and
         $r.service -eq 'INCENTIFY EMS V21 Cloud API' -and
         $r.version -eq '21.0.0' -and
         $r.status -eq 'ONLINE' -and
         $r.mutationRetrySafety -eq 'PERSISTENT_REQUEST_REPLAY' -and
         $r.latencyProfile -eq 'FAST_PATH_V6_ADMIN_FACE_CONTROL'){
        if($attempt -gt 1){$recovered++}
        $ok=$true;break
      }
    }catch{}
    if($attempt -lt 3){Start-Sleep -Milliseconds (200*$attempt)}
  }
  if($ok){Write-Host "TEST $test : PASS" -ForegroundColor Green;$pass++}
  else{Write-Host "TEST $test : FAIL after 3 attempts" -ForegroundColor Red;$fail++}
  Start-Sleep -Milliseconds 350
}
Write-Host "PASS=$pass FAIL=$fail RECOVERED_TRANSIENTS=$recovered"
if($fail -ne 0){throw 'V21 deployment reliability test failed after retry recovery.'}
Write-Host 'V21 DEPLOYMENT RELIABILITY: 10/10 LOGICAL REQUESTS PASS' -ForegroundColor Green
