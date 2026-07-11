# Fixed 20m companion UI production loop (AGENT_LOOP_TICK_companion-ui)
$Prompt = @'
Run companion UI production loop: research → implement next phase from plan → npm run companion:verify → companion:build → fix until verify passes. Hard cap 8 iterations. Goal: production-grade companion with zero node overlap and responsive sizing like Cursor. Read .cursor/companion-loop-state.json for current phase.
'@

while ($true) {
  Start-Sleep -Seconds 1200
  $payload = @{ prompt = $Prompt.Trim() } | ConvertTo-Json -Compress
  Write-Output "AGENT_LOOP_TICK_companion-ui $payload"
}
