# Fixed interval companion FEATURE build loop
param([int]$IntervalSeconds = 1200)

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RoadmapPath = Join-Path $Root ".cursor/feature-roadmap.json"
$StatePath = Join-Path $Root ".cursor/companion-feature-loop-state.json"

$Prompt = @"
Companion FEATURE loop tick. Read .cursor/feature-roadmap.json and .cursor/companion-feature-loop-state.json.
Research adjacent competitors if needed (recall Engrammic MCP first).
Implement the current atomic feature (currentFeatureId) in companion UI + gateway as needed.
Run: powershell -File scripts/companion-feature-loop.ps1
When doneWhen criteria met: mark feature complete in companion-feature-loop-state.json, advance to next feature id, increment iteration.
Hard cap 12 iterations. Goal: sticky org memory features with EAG differentiation (provenance, adjudication, live context).
"@

while ($true) {
  Start-Sleep -Seconds $IntervalSeconds
  $state = if (Test-Path $StatePath) { Get-Content $StatePath -Raw | ConvertFrom-Json } else { @{ currentFeatureId = "F01" } }
  $payload = @{
    prompt = $Prompt.Trim()
    featureId = $state.currentFeatureId
    iteration = $state.iteration
  } | ConvertTo-Json -Compress
  Write-Output "AGENT_LOOP_TICK_companion-feature $payload"
}
