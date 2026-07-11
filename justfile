# Engrammic Org Memory - Dev Commands

set dotenv-load

# Default: start everything
default: dev

# Start gateway + web UI (the main dev experience)
dev:
    #!/usr/bin/env bash
    set -e

    # Kill any existing gateway
    pkill -f "services/gateway/server.js" 2>/dev/null || true
    sleep 0.5

    echo "Starting gateway on :8790..."
    node services/gateway/server.js &
    GATEWAY_PID=$!
    trap "kill $GATEWAY_PID 2>/dev/null" EXIT

    sleep 2
    curl -sf http://127.0.0.1:8790/health > /dev/null || (echo "Gateway failed to start"; exit 1)
    echo "Gateway ready: http://127.0.0.1:8790/health"

    echo "Starting web UI on :5173..."
    cd apps/web && npm run dev

# Start only the gateway
gateway:
    node services/gateway/server.js

# Start only the web UI (assumes gateway running)
web:
    cd apps/web && npm run dev

# Run smoke tests
smoke:
    npm run smoke

# Install all deps
install:
    npm install
    npm --prefix apps/web install
    npm --prefix services/gateway install

# Seed fresh demo data
seed:
    curl -X POST http://127.0.0.1:8790/seed/reset

# Check MCP auth status
mcp-status:
    curl -s http://127.0.0.1:8790/mcp/status | jq .

# Login to Engrammic MCP
mcp-login:
    node scripts/mcp-login.js
