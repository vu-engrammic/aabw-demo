# Engrammic Org Memory

**The memory and governance layer underneath every AI workspace your org already uses.**

Employees keep working in Cursor, Claude Code, Codex — Engrammic connects there as an MCP server.
This app is the **pop-up control plane** next to those tools: surface relevant memory at task
start, govern who sees what, adjudicate contradictions, and measure how AI capability compounds.

> Competitors store memories. We adjudicate claims.

## Quick start

```bash
npm install
npm --prefix apps/web install
npm start
```

- Web: http://127.0.0.1:5173/
- Pop-up mode: http://127.0.0.1:5173/?popup=1 (or "Open pop-up" in the sidebar)
- Gateway: http://127.0.0.1:8790/health

Sign in as a demo persona (roles map to what WorkOS Directory Sync groups would provide).
Set `WORKOS_*` in `.env` for real SSO.

## What's inside

| Page | Purpose |
|------|---------|
| **Recall** | "What are you working on?" → governed context pack: capabilities with *why it worked*, grounded claims with evidence tiers, cautions. Copy as markdown for any agent. |
| Overview | Org memory health: hottest capabilities, open conflicts, gaps |
| Knowledge | Browse the graph by layer/team, provenance drawer on every node |
| Conflicts | Contradiction inbox — pick a winner → supersession + adopted belief |
| Sources | Mocked Slack / Drive / Confluence / Jira / GitHub sync status |
| Scopes | Role × classification access matrix, people directory |
| Analytics | Reuse heat, knowledge gaps, cross-team duplication, decay |
| Install MCP | Cursor / Claude Code / Codex / VS Code connection snippets |

## Architecture

- **Engrammic is MCP-only** — agents connect to `https://beta.engrammic.ai/mcp/` via OAuth, no API keys.
- The gateway (`services/gateway`) serves a local Engrammic-shaped store (Memory → Knowledge → Wisdom,
  `DERIVED_FROM` / `SUPERSEDES` / `CONTRADICTS`, ACL before recall) so the demo runs self-contained.
  The API contracts are designed so a real MCP bridge can replace the store without UI changes.
- Demo hook: Sarah Kim's **invoice OCR workflow** — when Sarah leaves, the workflow *and why it
  worked* stay in the org. Planted contradiction: leave policy 15 vs 20 days.

```bash
npm run smoke   # seed → ACL recall → conflict resolve → trace → analytics
```

See [docs/architecture.md](docs/architecture.md), [docs/plan.md](docs/plan.md), [docs/demo-script.md](docs/demo-script.md).
