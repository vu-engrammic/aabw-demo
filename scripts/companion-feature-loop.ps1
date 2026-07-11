# Companion FEATURE loop — one atomic feature per tick
# Reads .cursor/feature-roadmap.json + companion-feature-loop-state.json
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RoadmapPath = Join-Path $Root ".cursor/feature-roadmap.json"
$StatePath = Join-Path $Root ".cursor/companion-feature-loop-state.json"

Set-Location $Root

$roadmap = Get-Content $RoadmapPath -Raw | ConvertFrom-Json
$state = if (Test-Path $StatePath) { Get-Content $StatePath -Raw | ConvertFrom-Json } else { $null }
if (-not $state) {
  $state = @{
    iteration = 0
    maxIterations = $roadmap.maxIterations
    currentFeatureId = $roadmap.features[0].id
    currentFeatureName = $roadmap.features[0].name
    status = "planned"
    lastVerify = $null
    completedFeatures = @()
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
}

$feature = $roadmap.features | Where-Object { $_.id -eq $state.currentFeatureId } | Select-Object -First 1
if (-not $feature) {
  $feature = $roadmap.features | Where-Object { $_.id -notin $state.completedFeatures } | Select-Object -First 1
  if ($feature) {
    $state.currentFeatureId = $feature.id
    $state.currentFeatureName = $feature.name
  }
}

Write-Host "=== Feature loop tick: $($state.currentFeatureId) $($state.currentFeatureName) ===" -ForegroundColor Cyan
Write-Host "Iteration $($state.iteration)/$($state.maxIterations)" -ForegroundColor Cyan
if ($feature) {
  Write-Host "Done when: $($feature.doneWhen -join '; ')" -ForegroundColor DarkGray
}

Write-Host "[verify] smoke..."
npm run smoke
if ($LASTEXITCODE -ne 0) { $state.lastVerify = "smoke-fail"; $state | ConvertTo-Json -Depth 6 | Set-Content $StatePath; exit 1 }

Write-Host "[verify] companion layout..."
npm run companion:verify
if ($LASTEXITCODE -ne 0) { $state.lastVerify = "layout-fail"; $state | ConvertTo-Json -Depth 6 | Set-Content $StatePath; exit 1 }

Write-Host "[build] companion..."
npm run companion:build
if ($LASTEXITCODE -ne 0) { $state | ConvertTo-Json -Depth 6 | Set-Content $StatePath; exit 1 }

$state.lastVerify = "pass"
$state.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
$state | ConvertTo-Json -Depth 6 | Set-Content $StatePath
Write-Host "VERIFY PASSED for feature $($state.currentFeatureId)" -ForegroundColor Green
Write-Host "NOTE: Agent must implement feature before marking complete." -ForegroundColor Yellow
