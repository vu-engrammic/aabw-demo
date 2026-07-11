# API Reference — Gateway

Base URL: `http://127.0.0.1:8790` (proxied at `/api/*` behind Caddy in production).
All request/response bodies are JSON unless noted. Session auth uses an `httpOnly` cookie
(`aabw_session`) set by the login endpoints — the React app always sends
`credentials: "include"`.

> This document covers the endpoints that make up the My Tasco knowledge platform (health, auth,
> chat, file ingest). The gateway process also serves a larger set of endpoints inherited from a
> prior project (`/graph`, `/silos`, `/inbox`, `/conflicts`, `/connectors`, `/nodes`, `/analytics`,
> `/live/*`, `/mcp/*`, `/setup/*`) — those are not part of this platform's scope and are omitted
> here. See `services/gateway/server.js` if you need them.

## Errors

All errors are `{ "error": "<message>" }` with a non-2xx status. Common codes:

| Status | Meaning |
|---|---|
| 400 | Missing/invalid input (e.g. empty query, missing file field) |
| 401 | No valid session cookie |
| 403 | Session valid but not authorized for the requested resource |
| 404 | Unknown route |
| 413 | Uploaded file exceeds the 25MB limit |
| 502 | Upstream failure (Hindsight or Gemini) |

---

## `GET /health`

No auth required. Liveness/readiness probe.

**Response 200**
```json
{
  "ok": true,
  "service": "mytasco-knowledge",
  "hindsight": "connected",
  "engrammic": "mcp-token-missing",
  "totals": { "...": "legacy local-store counters" },
  "workos": false,
  "requestId": "b2b6c9d0-..."
}
```

`hindsight` is `"connected"` or `"disconnected"` based on a live `GET {HINDSIGHT_URL}/health`
check. `workos` reflects whether `WORKOS_API_KEY`/`WORKOS_CLIENT_ID` are configured.

---

## Auth endpoints

### `GET /auth/personas`

No auth required. Lists the demo personas the login screen renders.

**Response 200**
```json
{
  "workos": false,
  "personas": [
    { "userId": "emp_maya", "fullName": "Maya Chen", "email": "maya.chen@demo-corp.example", "role": "employee", "department": "Engineering" },
    { "userId": "mgr_sarah", "fullName": "Sarah Kim", "role": "manager", "department": "Finance", "...": "..." }
  ]
}
```

### `POST /auth/login`

Dev/demo login by persona id (no password) — the primary sign-in path for this hackathon build.

**Request**
```json
{ "personaId": "emp_maya" }
```

**Response 200** — sets the session cookie and returns the public user record:
```json
{ "user": { "userId": "emp_maya", "fullName": "Maya Chen", "email": "...", "role": "employee", "department": "Engineering" } }
```
Errors `500` if `personaId` doesn't match `seed/users.json`.

### `GET /auth/me`

Returns the current session, if any. No auth error on a missing session — always 200.

**Response 200**
```json
{ "user": { "userId": "emp_maya", "...": "..." }, "authenticated": true }
```

### `POST /auth/logout`

Clears the session cookie. **Response 200**: `{ "ok": true }`.

### `GET /auth/sso`

Optional WorkOS AuthKit flow — 302 redirects to the WorkOS-hosted authorization URL. Returns `400`
if WorkOS env vars aren't configured. Group membership maps to roles
(`org-memory-executives` → `executive`, etc. — see `WORKOS_GROUP_*` env vars).

### `GET /auth/callback`

WorkOS OAuth callback (`?code=&state=`). Exchanges the code, maps the WorkOS profile to a
`{ userId, fullName, email, role, department }` user, sets the session cookie, and 302s back to
`WEB_ORIGIN`.

### `GET /auth/workos/status`

Diagnostics for WorkOS configuration (which env vars are missing, redirect URIs to register,
configured group-to-role mapping). Useful when wiring up SSO.

---

## `POST /chat`

**Requires a session.** Ask a question; the gateway recalls RBAC-filtered chunks from Hindsight
and asks Gemini to answer using only those chunks.

**Request**
```json
{ "query": "What is the probation period policy?" }
```

**Response 200**
```json
{
  "answer": "The probation period is 3 months [1]. During this time, performance is reviewed monthly.",
  "sources": [
    { "id": 1, "file": "hr-probation-policy.md", "chunk": "All new employees undergo a probation period of 3 months...", "score": 0.91 }
  ],
  "confidence": "high",
  "deniedCount": 0,
  "user": { "userId": "emp_maya", "role": "employee", "department": "Engineering" }
}
```

- `confidence`: `"high"` (top score > 0.8), `"medium"` (0.5–0.8), `"low"` (< 0.5), or `"none"` (no
  matching chunks at all).
- `deniedCount`: number of chunks that matched the query but were filtered out by RBAC (0 for
  executives, who see everything). Rendered in the UI as "N documents hidden by access level."
- `400` if `query` is empty/missing. `502` if Hindsight/Gemini call fails.

RBAC filtering happens via `buildMetadataFilter(user)` in `services/gateway/lib/rbac-filter.js` —
see `docs/architecture.md` for the full tag-filter logic.

---

## `POST /ingest/file`

**Requires a session.** `multipart/form-data` upload — stores a document in Hindsight (verbatim
extraction mode) tagged with RBAC metadata.

**Form fields**
| Field | Required | Notes |
|---|---|---|
| `file` | yes | PDF, DOCX, PPTX, XLSX, TXT, MD, or image, up to 25MB |
| `classification` | no | `public` \| `internal` \| `confidential` \| `restricted`; defaults to `internal` |
| `team` | no | Defaults to the uploader's department |

**Response 200**
```json
{
  "ok": true,
  "documentId": "doc_9f2c...",
  "metadata": {
    "classification": "confidential",
    "team": "human-resources",
    "role_required": 1,
    "owner_id": "mgr_jonas",
    "source_file": "salary-bands.pdf"
  },
  "user": { "userId": "mgr_jonas", "role": "manager", "department": "Human Resources" }
}
```

- `400` if the `file` field is missing/empty.
- `413` if the file exceeds the 25MB limit.
- `502` (`"Hindsight ingest failed: ..."`) if the upstream Hindsight `/api/documents` call fails.

Ingested chunks become immediately searchable via `/chat` for any user whose RBAC filter matches
the assigned `classification`/`team`.
