---
name: engrammic
description: "Engrammic org memory companion — live recall, governed context packs, silo-aware ingest, and MCP bridge. Use BEFORE non-trivial work to recall org memory; use AFTER finishing to capture learnings. When the user says to onboard or connect Engrammic, run the onboarding flow."
metadata:
  version: 1.0.0
---

# Engrammic Org Memory

Engrammic is the **memory and governance layer** underneath AI workspaces (Cursor, Claude Code, Codex). The companion app is the control plane; Engrammic MCP is the org brain.

## Iron Law

1. **Recall before you think** — check what the org already knows.
2. **Capture after you implement** — write back decisions, capabilities, and gotchas.

## Companion + MCP

| Surface | URL / command |
|---------|-------------|
| Companion UI | Engrammic desktop app (system tray) |
| Gateway health | http://127.0.0.1:8790/health |
| MCP sign-in | Integrations → Connect MCP |
| Setup status | http://127.0.0.1:8790/setup/status |

Live recall runs automatically via Cursor hooks when the companion stack is up. Engrammic MCP provides `recall`, `learn`, `trace`, and graph tools when authenticated.

## Onboarding

First time in a workspace, or when the user asks to connect/onboard Engrammic → [onboarding.md](onboarding.md)

Trigger phrase: **Start Engrammic onboarding**

## Authenticate MCP

When MCP recall is empty, open the companion **Integrations** tab and click **Connect MCP**.

## Silos

- **Personal** (`__private__`) — owner-only memories
- **Team** — department-scoped org memory (default)

The companion sidebar switches silos; scoped API calls append `?silo=`.

## When to surface the companion

- Contradictions or conflicts in recall
- User asks about org policy, capabilities, or "what does the company know about X"
- Ingest from Gmail, files, or paste needs review
