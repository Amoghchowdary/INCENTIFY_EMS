param(
  [string]$Source = "C:\Users\MYPC\Desktop\Incentify_EMS\INCENTIFY_EMS_V21_GitHub_Frontend",
  [string]$DeploymentRoot = "C:\Users\MYPC\Desktop\Incentify_EMS\Deployment_Folder"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path "$Source\scripts\verify-v21.mjs")) {
  throw "V21 source not found: $Source"
}
if (-not (Test-Path $DeploymentRoot)) {
  throw "Deployment root not found: $DeploymentRoot"
}

function Resolve-GitDeploymentClone {
  param([string]$Root)

  if (Test-Path "$Root\.git") { return $Root }

  $preferred = @(
    (Join-Path $Root 'INCENTIFY_EMS'),
    (Join-Path $Root 'INCENTIFY-Billing')
  )
  foreach ($candidate in $preferred) {
    if (Test-Path "$candidate\.git") { return $candidate }
  }

  $clones = @(Get-ChildItem -Path $Root -Directory -ErrorAction Stop | Where-Object {
    Test-Path (Join-Path $_.FullName '.git')
  })

  if ($clones.Count -eq 1) { return $clones[0].FullName }
  if ($clones.Count -eq 0) { throw "No Git clone found under: $Root" }
  throw "Multiple Git clones found under $Root. Pass -DeploymentRoot with the exact Git clone path."
}

$Destination = Resolve-GitDeploymentClone $DeploymentRoot
Write-Host "V21 source:      $Source" -ForegroundColor Cyan
Write-Host "Git destination: $Destination" -ForegroundColor Cyan

# Keep the single deployment clone synchronized with the renamed production repository
# before Robocopy. This prevents the non-fast-forward push rejection seen in V20.
Push-Location $Destination
try {
  $dirty = git status --porcelain
  if ($dirty) {
    throw "Deployment Git clone has uncommitted changes. Commit/stash/review them before copying V21."
  }
  git remote set-url origin https://github.com/Amoghchowdary/INCENTIFY_EMS.git
  git fetch origin
  if ($LASTEXITCODE -ne 0) { throw 'git fetch origin failed.' }
  git checkout main
  if ($LASTEXITCODE -ne 0) { throw 'Could not checkout main.' }
  git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { throw 'Deployment clone is not a clean fast-forward of origin/main. Resolve Git history before V21 Robocopy.' }
} finally { Pop-Location }

Push-Location $Source
try {
  node .\scripts\verify-v21.mjs
  if ($LASTEXITCODE -ne 0) { throw 'V21 frontend verification failed.' }
  node .\scripts\test-api-client-v21.mjs
  if ($LASTEXITCODE -ne 0) { throw 'V21 API-client unit tests failed.' }
} finally { Pop-Location }

robocopy $Source $Destination /MIR /XD .git /R:2 /W:1
$rc = $LASTEXITCODE
if ($rc -ge 8) { throw "Robocopy failed with exit code $rc" }

Push-Location $Destination
try {
  node .\scripts\verify-v21.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Deployment-copy V21 verification failed.' }
  Write-Host ''
  Write-Host 'Deployment copy verified. Review Git status before committing:' -ForegroundColor Green
  git status
} finally { Pop-Location }

Write-Host ''
Write-Host 'V21 files copied successfully. This script intentionally does NOT git add/commit/push.' -ForegroundColor Green
