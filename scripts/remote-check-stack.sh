#!/bin/bash
set -euo pipefail
echo "=== docker ps ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo "=== hindsight logs ==="
docker logs hindsight --tail 40 || true
echo "=== gateway logs ==="
docker logs gateway --tail 20 || true
echo "=== hindsight health ==="
curl -sv --max-time 5 http://127.0.0.1:8888/health || true
echo
echo "=== gateway health ==="
curl -sf http://127.0.0.1:8790/health || true
echo
