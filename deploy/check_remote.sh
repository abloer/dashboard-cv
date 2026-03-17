#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEPLOY_USER="${DEPLOY_USER:-sysadm2}"
DEPLOY_HOST="${DEPLOY_HOST:-103.127.98.173}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/hosting/apps/vision}"
SSH_KEY="${SSH_KEY:-}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD:-sudo docker compose}"

if [[ -z "${SSH_KEY}" ]]; then
  echo "SSH_KEY is required."
  echo "Example:"
  echo "  SSH_KEY=/path/to/key.pem ${BASH_SOURCE[0]}"
  exit 1
fi

ssh -i "${SSH_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
set -euo pipefail
cd "${DEPLOY_PATH}"
echo "=== PWD ==="
pwd
echo "=== GIT STATUS ==="
git status -sb || true
echo "=== GIT REVISION ==="
git rev-parse HEAD || true
git log --oneline -n 3 || true
echo "=== DOCKER COMPOSE PS ==="
${DOCKER_COMPOSE_CMD} --env-file .env.production ps || true
echo "=== DOCKER PS ==="
sudo docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
echo "=== BACKEND LOGS ==="
${DOCKER_COMPOSE_CMD} --env-file .env.production logs --tail=80 backend || true
echo "=== FRONTEND LOGS ==="
${DOCKER_COMPOSE_CMD} --env-file .env.production logs --tail=80 frontend || true
EOF
