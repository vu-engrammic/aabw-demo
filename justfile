# My Tasco Knowledge Platform — dev & ops commands
# Run `just help` (or plain `just`) to see everything available.

set dotenv-load

# ---- config -----------------------------------------------------
# GCP deploy target
vm_name := "mytasco-vm-14c2caa"
vm_zone := "us-central1-a"
remote_dir := "/opt/mytasco"

# Local service endpoints
gateway_url := "http://127.0.0.1:8790"
hindsight_url := "http://127.0.0.1:8888"
web_url := "http://127.0.0.1:5173"

# Default: start everything
default: dev

# ===================================================================
# Local development
# ===================================================================

# Start everything locally: docker compose (hindsight + gateway) + web dev server
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up -d
    echo "Waiting for gateway on {{gateway_url}}/health ..."
    tries=0
    until curl -sf {{gateway_url}}/health > /dev/null 2>&1; do
        tries=$((tries + 1))
        if [ "$tries" -ge 40 ]; then
            echo "Gateway failed to start" >&2
            docker compose logs --tail=50 gateway
            exit 1
        fi
        sleep 0.5
    done
    echo "Gateway ready: {{gateway_url}}/health"
    echo "Starting web UI on {{web_url}} ..."
    cd apps/web && npm run dev

# Stop all local docker services (hindsight + gateway)
stop:
    docker compose down

# Tail docker logs (all services, or pass one: just logs gateway)
logs *service:
    docker compose logs -f --tail=100 {{service}}

# Seed sample documents into Hindsight (see README Quick Start)
seed:
    node scripts/seed-docs.js

# Reset + reseed the gateway's in-memory demo org data (nodes/graph/queries)
seed-reset:
    curl -sf -X POST {{gateway_url}}/seed/reset | jq .

# ---- process-based local dev (no Docker) -------------------------

# Start only the gateway (local node process, no Docker)
gateway:
    node services/gateway/server.js

# Start only the web UI (assumes gateway is already running)
web:
    cd apps/web && npm run dev

# Install all deps (root, web, gateway)
install:
    npm install
    npm --prefix apps/web install
    npm --prefix services/gateway install

# Run smoke tests
smoke:
    npm run smoke

# ===================================================================
# Deployment (GCP)
# ===================================================================

# Full deploy: pulumi up, rebuild the gateway image on the VM, restart services
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "==> Applying infra changes (pulumi up)..."
    cd infra && pulumi stack select prod && pulumi up --yes && cd ..
    echo "==> Rebuilding gateway image and restarting services on {{vm_name}}..."
    gcloud compute ssh {{vm_name}} --zone={{vm_zone}} --command="cd {{remote_dir}} && git pull && docker build -t mytasco-gateway:latest ./services/gateway && docker compose -f docker-compose.prod.yml up -d"
    echo "==> Deploy complete."

# Preview infra changes only (pulumi diff, nothing applied)
infra-preview:
    cd infra && pulumi stack select prod && pulumi preview

# SSH into the VM
ssh:
    gcloud compute ssh {{vm_name}} --zone={{vm_zone}}

# Tunnel VM port 80 to localhost:8080 (access via http://localhost:8080)
tunnel port="8080":
    @echo "Tunneling VM port 80 to http://localhost:{{port}}"
    @echo "Press Ctrl+C to stop"
    gcloud compute ssh {{vm_name}} --zone={{vm_zone}} -- -N -L {{port}}:localhost:80

# Tail logs on the VM (gateway + hindsight + caddy)
vm-logs:
    gcloud compute ssh {{vm_name}} --zone={{vm_zone}} --command="cd {{remote_dir}} && docker compose -f docker-compose.prod.yml logs -f --tail=100"

# ===================================================================
# Utilities
# ===================================================================

# Check health of all local services (gateway + hindsight)
health:
    #!/usr/bin/env bash
    set -o pipefail
    echo "Gateway  ({{gateway_url}}/health):"
    curl -sf {{gateway_url}}/health | jq . || echo "  UNREACHABLE"
    echo ""
    echo "Hindsight ({{hindsight_url}}/health):"
    curl -sf {{hindsight_url}}/health | jq . || echo "  UNREACHABLE"

# Quick curl test of the chat endpoint (logs in as a persona, asks a question)
test-chat query="What is the probation period?" persona="emp_maya":
    #!/usr/bin/env bash
    set -euo pipefail
    cookie_jar=$(mktemp)
    trap 'rm -f "$cookie_jar"' EXIT
    curl -sf -c "$cookie_jar" -X POST {{gateway_url}}/auth/login \
        -H "content-type: application/json" \
        -d "$(jq -n --arg id "{{persona}}" '{personaId:$id}')" > /dev/null
    curl -sf -b "$cookie_jar" -X POST {{gateway_url}}/chat \
        -H "content-type: application/json" \
        -d "$(jq -n --arg q "{{query}}" '{query:$q}')" | jq .

# Check MCP auth status
mcp-status:
    curl -s {{gateway_url}}/mcp/status | jq .

# Login to Engrammic MCP
mcp-login:
    node scripts/mcp-login.js

# ===================================================================
# Help
# ===================================================================

# List all available commands with descriptions
help:
    @just --list --unsorted
