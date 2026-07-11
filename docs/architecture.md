# Architecture — My Tasco Knowledge Platform

AI-native enterprise knowledge assistant: employees ask questions in natural language and get
cited answers pulled only from the documents their role is allowed to see.

## Components

```
┌─────────────┐  session   ┌──────────────┐   REST    ┌──────────────────────┐
│  React UI   │──cookie───▶│   Gateway    │──────────▶│  Hindsight (Docker)  │
│  apps/web   │            │  Node.js     │           │  - doc storage       │
│  (Vite)     │◀───JSON────│  services/   │◀──JSON────│  - chunking/embed    │
└─────────────┘            │  gateway     │           │  - verbatim recall   │
                            └──────┬───────┘           └──────────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  Gemini API       │
                          │  gemini-1.5-flash │
                          └──────────────────┘
```

| Component | Tech | Location | Purpose |
|---|---|---|---|
| Web UI | React 18 + Vite | `apps/web/src` | Persona login, chat, document upload |
| Gateway | Node.js (`node:http`, no framework) | `services/gateway/server.js` | Session auth, RBAC filtering, Hindsight/Gemini orchestration |
| Hindsight | Docker container (`ghcr.io/vectorize-io/hindsight`) | `docker-compose.yml` | Document ingest (verbatim mode), chunking, embeddings, tag-filtered recall |
| Gemini | Google Generative AI API | `services/gateway/lib/chat.js` | Answer generation from recalled chunks |

The gateway is a single Node process listening on `127.0.0.1:8790`. It talks to Hindsight over
plain HTTP (`HINDSIGHT_URL`, default `http://localhost:8888`) and to Gemini via
`@google/generative-ai`. The React app is a static SPA served by Vite in dev and by Caddy in
production; it never talks to Hindsight or Gemini directly — everything goes through the gateway
so RBAC is enforced in one place.

> The gateway codebase is shared with an earlier "Engrammic org memory" project and still exposes
> extra endpoints (`/graph`, `/silos`, `/conflicts`, `/connectors`, …) that are not part of the My
> Tasco knowledge platform. See `docs/api.md` for the endpoints that are actually in scope
> (`/health`, `/auth/*`, `/chat`, `/ingest/file`).

## Data flow

### 1. Login (persona picker)

`POST /auth/login { personaId }` looks the persona up in `seed/users.json`, signs an HMAC session
token (`services/gateway/lib/auth.js`), and sets it as an `httpOnly` cookie. WorkOS AuthKit SSO
(`GET /auth/sso` → `GET /auth/callback`) is wired in but optional — if `WORKOS_API_KEY` /
`WORKOS_CLIENT_ID` aren't set, only the five demo personas are available.

### 2. Ingest (document upload)

```
Upload.jsx → POST /ingest/file (multipart: file, classification, team)
  → Gateway parses multipart (busboy)
  → buildIngestMetadata(user, classification, team, filename)
      { classification, team, role_required, owner_id, source_file }
  → Hindsight POST /api/documents (multipart, extraction_mode=verbatim)
  → returns { documentId, metadata }
```

Hindsight owns extraction, chunking, and embedding — the gateway does no custom chunking. Chunks
are stored **verbatim** (not summarized) so citations can quote the source exactly.

### 3. Chat (retrieval + generation)

```
Chat.jsx → POST /chat { query }
  → buildMetadataFilter(user)         → Hindsight tag filter for the caller's role
  → Hindsight /api/recall (filtered)  → topK chunks the user is allowed to see
  → Hindsight /api/recall (unfiltered, non-executive only) → count for denied-count disclosure
  → Gemini prompt: system instructions + numbered sources + question
  → { answer, sources[], confidence, deniedCount }
```

See `services/gateway/lib/chat.js` for the exact prompt template and confidence bands
(high > 0.8, medium 0.5–0.8, low otherwise, based on the top chunk's relevance score).

## RBAC model

RBAC is enforced entirely through **Hindsight metadata tags** — there is no separate ACL database.
Every stored chunk carries the metadata attached at ingest; every recall is scoped by a tag filter
built from the caller's session.

### Roles and classifications

- **Roles** (rank order, `services/gateway/lib/rbac-filter.js: ROLE_RANK`): `employee` (0) <
  `manager` (1) < `director` (2) < `executive` (3).
- **Classifications**: `public`, `internal`, `confidential`, `restricted`.

| Classification | employee | manager / director | executive |
|---|---|---|---|
| public | ✓ | ✓ | ✓ |
| internal | ✓ | ✓ | ✓ |
| confidential | ✗ | ✓ (own team only) | ✓ |
| restricted | ✗ | ✗ | ✓ |

### How the filter is built (`buildMetadataFilter(user)`)

- **Executive** (`rank >= 3`): `canSeeAll: true`, no tag filter — recall is unrestricted.
- **Everyone else**: tag list always includes `classification:public` and
  `classification:internal`.
- **Manager and director** (`rank >= 1`) additionally get a compound tag
  `classification:confidential,team:<their-team>` — so confidential documents only surface for
  managers/directors in the *same* team that owns the document.
- `restricted` is never added to a non-executive's tag list, so restricted content is invisible to
  everyone except executives regardless of team.

### How ingest metadata is built (`buildIngestMetadata`)

```json
{
  "classification": "confidential",
  "team": "human-resources",
  "role_required": 1,
  "owner_id": "mgr_jonas",
  "source_file": "salary-bands.md"
}
```

`role_required` is derived from classification for convenience (`public`/`internal` → 0,
`confidential` → 1, `restricted` → 3) but the actual gate at query time is the tag filter, not this
field.

### Denied-count disclosure

`askQuestion()` runs the filtered recall for the answer, then (for non-executives) a second,
unfiltered recall purely to count results. The difference is surfaced to the user as
`deniedCount` — e.g. "2 documents hidden by access level" — so users know relevant material exists
without ever seeing its content.

## Personas (`seed/users.json`)

| Name | userId | Role | Department |
|---|---|---|---|
| Maya Chen | `emp_maya` | employee | Engineering |
| Sarah Kim | `mgr_sarah` | manager | Finance |
| Jonas Patel | `mgr_jonas` | manager | Human Resources |
| Elliot Rivera | `dir_elliot` | director | Product |
| Priya Rao | `exec_priya` | executive | Executive |

## Frontend

`apps/web/src/main.jsx` renders a persona-picker login screen, then a two-tab shell (`Ask` /
`Upload`) once signed in. `Chat.jsx` posts to `/chat` and renders the answer, a confidence badge,
numbered source cards, and the denied-count banner. `Upload.jsx` posts a multipart form to
`/ingest/file` with a classification dropdown (team is fixed to the signed-in user's department).
