param(
  [Parameter(Mandatory=$true)][string]$Url
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $root 'js\config.js'
$url = $Url.Trim()
if (-not ($url -match '^https://script\.google\.com/macros/s/.+/exec$')) {
  throw 'Use the V21 Google Apps Script Web App URL ending in /exec.'
}
$text = Get-Content -Raw -Path $configPath
$text = [regex]::Replace($text, "API_URL:\s*'[^']*'", "API_URL: '$url'")
[System.IO.File]::WriteAllText($configPath, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'INCENTIFY EMS V21 API URL configured.' -ForegroundColor Green
Write-Host $url
Write-Host 'No Bridge.html or iframe is used in V21.' -ForegroundColor Cyan
Write-Host 'Commit and push js/config.js to publish the configured GitHub Pages build.' -ForegroundColor Cyan
