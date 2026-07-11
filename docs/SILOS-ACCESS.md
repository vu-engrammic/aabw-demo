# Silos, Permissions & Access Control

Enterprise access layer for the org memory control plane. Aligns with
[architecture.md](./architecture.md) governance: **ACL before recall** — denied items
are counted, never shown.

## Goals (demo → enterprise)

| Capability | MVP (this repo) | Enterprise evolution |
|------------|-----------------|----------------------|
| Knowledge platform | Ingest + graph + recall | Connector ACL mirror (GDrive, Confluence) |
| AI search | Keyword recall + live MCP | Vector index with filterable ACL fields |
| AI assistant | Context pack from governed recall | RAG with query-time security trim |
| Access control | Role × classification × silo scope | Groups, ABAC labels, audit log |
| Demo | Persona + silo switcher | WorkOS Directory Sync groups |

## Data model

```
Organization (single tenant)
  └── Silo (scope container)
        └── Node (memory / knowledge / wisdom)
              ├── scope: private | team | org
              ├── team: department string (ACL + grouping)
              ├── ownerId: userId (private ownership)
              └── classification: public | internal | confidential | restricted
```

### Silo IDs

| ID | Label | Default? | Visibility |
|----|-------|----------|------------|
| `user.department` | Engineering, Finance, … | **Yes** | Team-scoped nodes (`scope=team`) matching department |
| `__private__` | Personal | Opt-in | `scope=private` AND `ownerId === user.userId` |
| `__denied__` | — | Error state | Empty results (cross-department request) |

**Default unchanged:** no `?silo=` param → user's department team silo.

## Permission evaluation (two layers)

### Layer 1 — ACL (`canSee`)

Role rank × classification × team (for confidential):

| Classification | employee | manager+ | executive |
|----------------|----------|----------|-----------|
| public | ✓ | ✓ | ✓ |
| internal | ✓ | ✓ | ✓ |
| confidential | ✗ | ✓ own team | ✓ |
| restricted | ✗ | ✗ | ✓ |

### Layer 2 — Silo scope (`inSilo`)

After ACL passes:

- **Team silo** (default): `scope !== private` AND `normTeam(node.team) === normTeam(silo)`
- **Private silo**: `scope === private` AND owner matches session user
- **No silo / `all`**: ACL only (recall without param — legacy behavior)

Private nodes never appear in team silo views. Team nodes never appear in private silo.

## Query-time filtering

All read paths apply **ACL → silo** in order:

```
GET /graph, /inbox, /analytics  → scopedNodes(user, silo)
POST /recall                    → scopedNodes when ?silo= present
MCP recall/graph                → post-filter when silo ≠ default team
```

Denied-but-relevant hits increment `deniedCount` (existence disclosed, content hidden).

## Write path

Ingest (document, file, Gmail sync) tags writes with:

- `team` — department (always)
- `scope` — `private` when `?silo=__private__`, else `team`
- `ownerId` — session `userId`

MCP ingest adds tags: `scope-private`, `owner:{userId}`, `team-{slug}`.

## API

| Route | Silo param | Notes |
|-------|------------|-------|
| `GET /silos` | optional | Returns Personal + department |
| `GET /graph` | `?silo=` | Filtered nodes + edges |
| `GET /inbox` | `?silo=` | Conflicts, verification in scope |
| `POST /recall` | `?silo=` | Team/private scoped when set |
| `POST /ingest/*` | `?silo=` | Writes to active silo scope |
| `GET /scopes` | — | Role × classification matrix |

## UI

- **Companion sidebar**: Private / Team space → passes `?silo=` on all API calls
- **Web admin**: Silo picker populated from `/silos`

## Research references

Patterns from Glean, SharePoint Graph Search, Notion teamspaces, Azure AI Search:

1. Filter at query boundary, not post-retrieval
2. Mirror source ACLs at ingest (future connectors)
3. Groups over per-user ACLs at scale
4. Disclose denial counts without leaking content

## Roadmap (not in MVP)

- [ ] WorkOS group → silo membership
- [ ] Org-wide (`scope=org`) nodes visible in all team silos
- [ ] Per-user MCP OAuth (vs shared org token)
- [ ] Graph cache keyed by `userId:silo`
- [ ] ACL preview before recall (F11)
- [ ] Audit log: query, silo, denied count
