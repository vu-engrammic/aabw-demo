# Justfile Quick Reference

Quick reference for every [`just`](https://github.com/casey/just) recipe defined in the project
[`justfile`](../justfile). Run `just` or `just help` at any time to list all recipes with their
one-line descriptions straight from the source of truth.

**Global prerequisites**

- [`just`](https://github.com/casey/just) installed and on `PATH`.
- A `.env` file at the repo root (copy from `.env.example`) — the justfile loads it automatically
  via `set dotenv-load`, so recipes that call `docker compose` or hit `{{gateway_url}}` pick up
  `GEMINI_API_KEY`, `SESSION_SECRET`, etc. from it.
- `docker` + `docker compose` for anything that touches the local stack.
- `curl` and `jq` for the health/status/test recipes (they pipe responses through `jq .`).
- `gcloud` (authenticated, correct project set) for anything under **Deployment** and **VM Access**.
- `pulumi` (authenticated, stack access to `prod`) for `deploy` and `infra-preview`.

Config baked into the top of the justfile that every recipe below reuses:

| Variable | Value |
|---|---|
| `vm_name` | `mytasco-vm-14c2caa` |
| `vm_zone` | `us-central1-a` |
| `remote_dir` | `/opt/mytasco` |
| `gateway_url` | `http://127.0.0.1:8790` |
| `hindsight_url` | `http://127.0.0.1:8888` |
| `web_url` | `http://127.0.0.1:5173` |

Running plain `just` with no recipe name runs `default`, which is aliased to `dev`.

---

## 1. Local Development

| Command | What it does |
|---|---|
| `just dev` | Starts the full local stack: brings up `docker compose` (Hindsight + Gateway), polls `{{gateway_url}}/health` until it's ready (up to 20s), then runs `npm run dev` in `apps/web`. |
| `just stop` | Stops all local Docker services (`docker compose down`). |
| `just logs [service]` | Tails Docker logs for all services, or one named service (e.g. `gateway`, `hindsight`). |
| `just seed` | Seeds sample documents into Hindsight via `node scripts/seed-docs.js`. |
| `just seed-reset` | Resets and reseeds the gateway's in-memory demo org data (nodes/graph/queries) by POSTing to `/seed/reset`. |
| `just gateway` | Runs only the Gateway as a local Node process (no Docker) — `node services/gateway/server.js`. |
| `just web` | Runs only the web UI dev server (`cd apps/web && npm run dev`); assumes the Gateway is already running elsewhere. |
| `just install` | Installs dependencies for the root project, `apps/web`, and `services/gateway`. |
| `just smoke` | Runs the smoke test suite (`npm run smoke`, i.e. `scripts/smoke.js`). |

### Details

**`just dev`**
- When to use: the default "start everything and go" command for local development. This is what `just` (no args) runs.
- Example: `just dev`
- Prerequisites: Docker running; `.env` populated with `GEMINI_API_KEY`; `apps/web` deps installed (run `just install` first if you haven't).
- Notes: fails loudly with the last 50 lines of gateway logs if the gateway doesn't come up within ~20 seconds.

**`just stop`**
- When to use: shutting down the local Hindsight + Gateway containers when you're done, or before switching branches/environments.
- Example: `just stop`

**`just logs`**
- When to use: debugging a service that's misbehaving while `just dev`/`docker compose` is running.
- Example: `just logs` (all services), `just logs gateway` (just the gateway), `just logs hindsight`
- Notes: follows output (`-f`) with the last 100 lines of scrollback.

**`just seed`**
- When to use: after first bringing the stack up, or whenever you want to repopulate Hindsight with the demo document set (per the README Quick Start).
- Example: `just seed`
- Prerequisites: Hindsight must be up and reachable (i.e. `just dev` or `docker compose up -d` already run).

**`just seed-reset`**
- When to use: resetting the Gateway's in-memory demo data (org nodes/graph/queries) back to a known state, distinct from the document corpus in Hindsight.
- Example: `just seed-reset`
- Prerequisites: Gateway must be running and reachable at `{{gateway_url}}`.

**`just gateway`**
- When to use: iterating on the gateway service directly without Docker overhead/rebuilds — faster feedback loop, direct `node` debugging.
- Example: `just gateway`
- Prerequisites: `services/gateway` deps installed (`just install`); `.env` present (Hindsight URL, Gemini key, session secret); Hindsight reachable separately if you need RAG features (e.g. run it via `docker compose up -d hindsight`).

**`just web`**
- When to use: iterating on the frontend only, with the Gateway already running (via `just gateway`, `just dev`, or Docker).
- Example: `just web`
- Prerequisites: `apps/web` deps installed; a Gateway instance reachable at the URL the web app expects.

**`just install`**
- When to use: first-time repo setup, or after pulling changes that touch `package.json` in the root, `apps/web`, or `services/gateway`.
- Example: `just install`

**`just smoke`**
- When to use: quick end-to-end sanity check that the stack is wired up correctly (e.g. before a demo or after a deploy).
- Example: `just smoke`
- Prerequisites: the target stack (local or otherwise, per `scripts/smoke.js`) must be running.

---

## 2. Deployment (GCP)

| Command | What it does |
|---|---|
| `just deploy` | Full deploy: `pulumi up` on the `prod` stack, then SSHes into the VM to `git pull`, rebuild the gateway Docker image, and restart services via `docker-compose.prod.yml`. |
| `just infra-preview` | Runs `pulumi preview` against the `prod` stack — shows planned infra changes without applying anything. |
| `just ssh` | Opens an interactive SSH session to the deploy VM. |

### Details

**`just deploy`**
- When to use: shipping infra + application changes to production. This is the "push to prod" button — use deliberately, typically after `just infra-preview` looks correct and code is merged to `main`.
- Example: `just deploy`
- Prerequisites: `pulumi` authenticated with access to the `prod` stack; `gcloud` authenticated with SSH access to `{{vm_name}}` in zone `{{vm_zone}}`; the VM has a git checkout at `{{remote_dir}}` (`/opt/mytasco`) with the correct remote configured.
- Notes: equivalent to CI's `main`-branch deploy step (see `.github/workflows/deploy.yml`), but run manually/locally. It is destructive-adjacent (applies infra changes and restarts prod services) — review `just infra-preview` output first if unsure.

**`just infra-preview`**
- When to use: reviewing what a `pulumi up` would change before committing to `just deploy` — safe, read-only.
- Example: `just infra-preview`
- Prerequisites: `pulumi` authenticated with access to the `prod` stack.

**`just ssh`**
- When to use: manual/ad-hoc investigation on the production VM (checking disk space, inspecting containers directly, etc.) beyond what `just vm-logs` gives you.
- Example: `just ssh`
- Prerequisites: `gcloud` authenticated with SSH/IAM permissions for `{{vm_name}}`.

---

## 3. VM Access

| Command | What it does |
|---|---|
| `just tunnel` | Opens an SSH tunnel forwarding VM ports to localhost: `8080→80` (Caddy/web), `8790` (Gateway API), `8888` (Hindsight API), `9999` (Hindsight UI). |
| `just vm-logs` | Tails logs for all prod services (gateway + hindsight + caddy) directly on the VM via `docker-compose.prod.yml`. |

### Details

**`just tunnel`**
- When to use: hitting production services from your local machine — e.g. testing the prod Gateway API with local tools, or opening the Hindsight admin UI (`localhost:9999`) without exposing it publicly.
- Example: `just tunnel`, then in another terminal `curl http://localhost:8790/health` or open `http://localhost:8080` in a browser.
- Prerequisites: `gcloud` authenticated with SSH access to `{{vm_name}}`.
- Notes: runs in the foreground (`-N`, no remote command) — leave the terminal open, `Ctrl+C` to stop tunneling.

**`just vm-logs`**
- When to use: debugging an issue on the live production stack — the remote equivalent of `just logs`.
- Example: `just vm-logs`
- Prerequisites: `gcloud` SSH access; services already running on the VM under `docker-compose.prod.yml` in `{{remote_dir}}`.

---

## 4. Testing / Status

| Command | What it does |
|---|---|
| `just test-chat [query] [persona]` | Logs in as a persona and POSTs a chat query to the Gateway, printing the JSON response. Defaults: `query="What is the probation period?"`, `persona="emp_maya"`. |
| `just health` | Checks `/health` on both the Gateway and Hindsight and pretty-prints the JSON (or reports `UNREACHABLE`). |
| `just mcp-status` | Checks the Engrammic MCP auth status via `{{gateway_url}}/mcp/status`. |
| `just mcp-login` | Runs `node scripts/mcp-login.js` to sign in to the Engrammic MCP and populate `ENGRAMMIC_MCP_TOKEN`. |

### Details

**`just test-chat`**
- When to use: quickly verifying the chat/RBAC pipeline end-to-end — login as a persona, ask a question, inspect the answer/citations — without going through the UI.
- Example (defaults): `just test-chat`
- Example (custom): `just test-chat "What are the salary bands?" exec_priya`
- Prerequisites: Gateway reachable at `{{gateway_url}}`; the persona ID must be a valid seeded persona (e.g. `emp_maya`, `exec_priya`); `jq` installed.
- Notes: uses a temp cookie jar for the session and cleans it up on exit (`trap ... EXIT`).

**`just health`**
- When to use: a fast "is everything up?" check before diving into a debugging session or before running `just smoke`.
- Example: `just health`
- Prerequisites: none beyond `curl`/`jq`; safe to run even if services are down (prints `UNREACHABLE` per-service instead of failing the whole command).

**`just mcp-status`**
- When to use: checking whether the Gateway currently has a valid Engrammic MCP token/session, e.g. when graph/recall features aren't working.
- Example: `just mcp-status`
- Prerequisites: Gateway reachable at `{{gateway_url}}`.

**`just mcp-login`**
- When to use: (re-)authenticating with the Engrammic MCP when `just mcp-status` shows you're logged out or the token expired.
- Example: `just mcp-login`
- Prerequisites: `ENGRAMMIC_MCP_URL` set in `.env`; browser access for the interactive sign-in flow triggered by `scripts/mcp-login.js`.

---

## Everything else

**`just help`**
- What it does: prints `just --list --unsorted`, i.e. every recipe in file order with its description comment.
- When to use: whenever you forget a command name — faster than opening this doc.
- Example: `just help` (equivalent to running plain `just`, since `default` → `dev`... note `help` itself must be called explicitly, it is not the default recipe).
