#!/bin/bash
set -euo pipefail
cd /home/novusedge/aabw-demo
git config --global --add safe.directory /home/novusedge/aabw-demo
echo "HEAD=$(git log -1 --oneline)"
docker images mytasco-gateway:latest --format '{{.ID}} {{.CreatedSince}}'
docker stop gateway || true
docker rm -f gateway || true
if docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.prod.yml up -d --no-deps gateway
else
  docker-compose -f docker-compose.prod.yml up -d --no-deps gateway
fi
sleep 4
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo '--- health ---'
curl -sf http://127.0.0.1:8790/health || true
echo
echo '--- departments ---'
curl -sf -o /dev/null -w 'departments=%{http_code}\n' http://127.0.0.1:8790/departments || true
