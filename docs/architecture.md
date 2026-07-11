# Architecture

## Product shape

Engrammic's core product is the MCP server. We do **not** ship a coding harness — work happens in
Cursor / Claude Code / Codex where Engrammic is already connected via MCP OAuth (no API keys).

This app is the **org memory control plane** beside those tools:

```
Cursor / Claude Code / Codex ──MCP──► Engrammic (recall / learn / conflicts / trace)
                                          ▲
        governs, explains, measures       │
Org Memory app (this repo) ───────────────┘
```

Pop-up mode (`/?popup=1`) is a small always-on-top window: type the task, get a governed context
pack, copy it into any agent. It mirrors what Engrammic's MCP `recall` returns at task start.

## Layers (product → EAG)

| Product concept | Layer | Notes |
|-----------------|-------|-------|
| Ingested Slack/Drive/Jira blobs | memory | source URI + tier, decays |
| Extracted claims | knowledge | confidence + `DERIVED_FROM` evidence |
| Capabilities (prompts/workflows) | knowledge (`type: capability`) | owner, team, **whyItWorked** |
| Adopted practices | wisdom | created on conflict resolution, `ABOUT` edges |
| Provenance drawer | meta | `trace()` walk over DERIVED_FROM / ABOUT / SUPERSEDES |

## Governance

- **ACL before recall**: role rank × classification (public / internal / confidential / restricted)
  × team. Denied-but-relevant items are counted and disclosed ("N hidden by role scope"), never shown.
- **Conflicts**: contradiction inbox; picking a winner marks the loser superseded and crystallizes
  a wisdom belief. Superseded nodes drop out of recall.
- **Roles** stand in for WorkOS Directory Sync groups; real SSO works when `WORKOS_*` is set.

## Analytics

- **Heat**: recall hits bump node heat; hottest = most reused capability.
- **Gaps**: queries with zero hits are recorded — the org's unanswered questions.
- **Duplication**: capability pairs with high token overlap across teams.

## Local store vs live Engrammic

`services/gateway/lib/store.js` is an Engrammic-shaped local store so the demo is self-contained.
Because Engrammic is MCP-only, a production deployment would put an MCP client (with its own OAuth
session) behind the same gateway API — the UI contracts don't change.
