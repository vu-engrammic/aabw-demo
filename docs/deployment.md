# Deployment — My Tasco Knowledge Platform

## Local setup

Prerequisites: Node.js 20, Docker + Docker Compose, a Gemini API key.

```bash
# 1. Environment
cp .env.example .env
# set GEMINI_API_KEY (and optionally SESSION_SECRET)

# 2. Start Hindsight + Gateway
docker compose up -d

# 3. Seed the 10 sample documents into Hindsight
node scripts/seed-docs.js

# 4. Install deps and start the web app
npm install
npm --prefix apps/web install
npm --prefix services/gateway install
cd apps/web && npm run dev
```

Open `http://localhost:5173`. The gateway listens on `127.0.0.1:8790`, Hindsight on `8888`
(API) / `9999`.

### Running without Docker

`justfile` starts the gateway and web UI together for iterative dev (Hindsight still needs to run
via `docker compose up -d hindsight` separately):

```bash
just dev        # gateway on :8790, then web on :5173
just gateway    # gateway only
just web        # web only (assumes gateway already running)
just seed        # POST /seed/reset (resets the legacy in-memory demo store, not Hindsight docs)
```

### Key environment variables (`.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Used by both the gateway (chat) and Hindsight (`HINDSIGHT_API_LLM_API_KEY`) |
| `HINDSIGHT_URL` | `http://localhost:8888` | Gateway → Hindsight base URL (`http://hindsight:8888` inside Compose) |
| `GATEWAY_PORT` | `8790` | Gateway listen port |
| `WEB_ORIGIN` | `http://127.0.0.1:5173` | Allowed CORS origin / post-login redirect target |
| `SESSION_SECRET` | dev fallback in code | HMAC secret for session cookies — **must** be set in production |
| `WORKOS_API_KEY` / `WORKOS_CLIENT_ID` / `WORKOS_COOKIE_PASSWORD` | — | Optional SSO (AuthKit). Omit to use demo personas only |

## Docker Compose

### `docker-compose.yml` (local dev)

- `hindsight` — official image, exposes `8888`/`9999`, persists to a named volume
  `hindsight-data` mounted at `/home/hindsight/.pg0`.
- `gateway` — built from `services/gateway/Dockerfile`, exposes `8790`, bind-mounts the source
  (`./services/gateway:/app`) with an anonymous `/app/node_modules` volume for live-reload-style
  dev.

Both services share `GEMINI_API_KEY`; the gateway also gets `HINDSIGHT_URL=http://hindsight:8888`
(container-to-container DNS) and `SESSION_SECRET` (falls back to `dev-secret-change-me`).

### `docker-compose.prod.yml` (VM deployment)

Adds a `caddy` service in front of `gateway` and `hindsight`, terminating `80`/`443` and reverse
proxying everything to the gateway (`Caddyfile`):

```
{$DOMAIN:localhost} {
  reverse_proxy /api/* gateway:8790
  reverse_proxy /* { to gateway:8790 }
}
```

`gateway` here pulls a pre-built image (`mytasco-gateway:latest`) instead of building from source,
and `SESSION_SECRET` has no dev fallback — it must be supplied. Volumes: `hindsight-data`,
`caddy-data`, `caddy-config`.

## GCP deployment with Pulumi

Infra lives in `infra/` (TypeScript, `@pulumi/gcp` + `@pulumi/command`), stack `prod`
(`infra/Pulumi.prod.yaml`).

### Resources (`infra/index.ts`)

| Resource | Name | Notes |
|---|---|---|
| `gcp.compute.Firewall` | `mytasco-firewall` | Opens `80`, `443`, `8790` from `0.0.0.0/0` to instances tagged `mytasco` |
| `gcp.compute.Instance` | `mytasco-vm` | `e2-medium`, Ubuntu 22.04 LTS, 50GB boot disk, ephemeral public IP, `cloud-platform` service account scope |
| — startup script | inline | Installs `docker.io` + `docker-compose`, enables and starts the Docker daemon |
| `gcp.storage.Bucket` | `mytasco-static` | Hosts the built React app as a static website (`index.html` for both main page and 404) |
| `gcp.storage.BucketIAMBinding` | `mytasco-static-public` | Grants `roles/storage.objectViewer` to `allUsers` |

Stack outputs: `vmIp`, `vmName`, `staticBucketUrl`.

### Manual deploy

```bash
cd infra
npm install
pulumi config set gcp:project <your-project-id>
pulumi stack select prod --create
pulumi up
```

The VM's Docker Compose stack is expected at `/opt/mytasco` on the instance — provision it (copy
`docker-compose.prod.yml`, `Caddyfile`, `.env`) once via SSH after the first `pulumi up`.

## CI/CD pipeline (`.github/workflows/deploy.yml`)

Triggers on push/PR to `main`.

**`build` job** (every push/PR):
1. `npm ci` at root, `services/gateway`, and `apps/web`.
2. `npm run build` for the React app.
3. `docker build -t mytasco-gateway:${{ github.sha }} ./services/gateway`.

**`deploy` job** (push to `main` only, needs `build`):
1. Install Pulumi, authenticate to GCP with `GCP_SA_KEY`, set up `gcloud`.
2. `cd infra && npm ci && pulumi stack select prod --create && pulumi up --yes`.
3. SSH to the VM (`vmIp` from Pulumi output) and run `docker compose pull && docker compose up -d`
   in `/opt/mytasco`.
4. `gsutil -m rsync -r apps/web/dist gs://<staticBucketUrl>` to publish the built SPA.

### Required GitHub secrets

| Secret | Used for |
|---|---|
| `GCP_PROJECT_ID` | Pulumi/GCP project context |
| `GCP_SA_KEY` | Service account JSON for `google-github-actions/auth` |
| `PULUMI_ACCESS_TOKEN` | Pulumi Cloud backend auth |
| `VM_SSH_KEY` | SSH private key for the deploy step |
| `GEMINI_API_KEY` | Should also be present on the VM's `.env` (not injected by CI — set once during provisioning) |
| `SESSION_SECRET` | Same — lives in the VM's `.env`, not passed through CI |

## Out of scope for this deployment

Per the design spec: WorkOS SSO is optional/off by default, there's no async ingest job queue
(uploads run synchronously with a ~120s timeout), and there's no document versioning or connector
sync (Gmail/Drive/Slack) in the My Tasco flow.
