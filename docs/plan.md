# Build plan — Engrammic Org Memory (AABW hackathon)

## Product decision

Keep the core MCP product; do **not** ship a coding harness. Build the **pop-up org memory app**:
a control plane that surfaces relevant memory, org scoping, and knowledge/context management for
enterprise, while work stays in Cursor / Claude Code / Codex connected to Engrammic via MCP.

Started fresh — findings carried from the earlier org-memory prototype (planted contradiction,
tier-boosted recall, provenance drawer, ACL-before-recall), none of its code.

## Status

### Done

- [x] Fresh store: memory/knowledge/wisdom, capabilities with `whyItWorked`, edges, conflicts, heat, queries
- [x] Seeded demo corp (Sarah's invoice OCR hook, leave 15-vs-20 contradiction, restricted board pack, duplicate receipt checkers)
- [x] Gateway REST API: recall (context pack), nodes + trace, conflicts resolve → supersession + belief, sources, scopes, analytics
- [x] UI: sidebar shell + 8 pages, pop-up mode (`/?popup=1`), provenance drawer, copy-context-pack
- [x] Auth: demo personas (WorkOS SSO optional via `.env`)
- [x] Smoke test (`npm run smoke`)

### Next

- [ ] Real MCP bridge behind the gateway API (OAuth session per org)
- [ ] WorkOS Directory Sync groups → live role mapping
- [ ] Capture form: submit a practice (title, content, whyItWorked) → knowledge + belief
- [ ] Recommend-at-task-start webhook for MCP clients
- [ ] Polish pass on pop-up sizing/keyboard flow

## Demo

See [demo-script.md](demo-script.md) — pop-up beside Cursor, governance denial, contradiction
adjudication, duplication analytics, MCP install close.
