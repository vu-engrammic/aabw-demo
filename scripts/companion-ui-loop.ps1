# Companion UI production loop — verify → build → update iteration state
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$StatePath = Join-Path $Root ".cursor/companion-loop-state.json"

Write-Host "=== Companion UI loop tick ===" -ForegroundColor Cyan
Set-Location $Root

$state = @{
  iteration = 1
  maxIterations = 8
  phase = 2
  phaseName = "responsive-shell"
  phases = @(
    "layout-engine", "responsive-shell", "visual-polish", "graph-performance",
    "label-collision", "all-tabs-responsive", "browser-verification", "production-gate"
  )
  lastVerify = "unknown"
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
}
if (Test-Path $StatePath) {
  $state = Get-Content $StatePath -Raw | ConvertFrom-Json
  $state.iteration = [int]$state.iteration + 1
  if ($state.iteration -gt $state.maxIterations) {
    Write-Host "Hard cap ($($state.maxIterations) iterations) reached — stopping." -ForegroundColor Yellow
    exit 0
  }
  $phaseIdx = [Math]::Min($state.iteration - 1, $state.phases.Count - 1)
  $state.phase = $state.iteration
  $state.phaseName = $state.phases[$phaseIdx]
}

Write-Host "Iteration $($state.iteration)/$($state.maxIterations) — phase: $($state.phaseName)" -ForegroundColor Cyan

Write-Host "[verify] graph layout fixtures..."
node scripts/companion-ui-verify.mjs
if ($LASTEXITCODE -ne 0) {
  $state.lastVerify = "fail"
  $state | ConvertTo-Json | Set-Content $StatePath
  Write-Host "VERIFY FAILED — agent should fix layout and re-run." -ForegroundColor Red
  exit 1
}
$state.lastVerify = "pass"

Write-Host "[build] companion..."
npm run companion:build
if ($LASTEXITCODE -ne 0) {
  $state | ConvertTo-Json | Set-Content $StatePath
  exit 1
}

$state.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
$state | ConvertTo-Json | Set-Content $StatePath
Write-Host "VERIFY PASSED + BUILD OK (iteration $($state.iteration))" -ForegroundColor Green
