#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEPLOY_USER="${DEPLOY_USER:-sysadm2}"
DEPLOY_HOST="${DEPLOY_HOST:-103.127.98.173}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/hosting/apps/vision}"
PERSISTENCE_ROOT="${PERSISTENCE_ROOT:-${DEPLOY_PATH}-data}"
HOST_SERVER_DATA_DIR="${HOST_SERVER_DATA_DIR:-${PERSISTENCE_ROOT}/server-data}"
HOST_RUNTIME_ANALYSIS_DIR="${HOST_RUNTIME_ANALYSIS_DIR:-${PERSISTENCE_ROOT}/runtime-analysis}"
HOST_MODELS_DIR="${HOST_MODELS_DIR:-${PERSISTENCE_ROOT}/models}"
SSH_KEY="${SSH_KEY:-}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD:-sudo --preserve-env=HOST_SERVER_DATA_DIR,HOST_RUNTIME_ANALYSIS_DIR,HOST_MODELS_DIR docker compose}"

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
echo "=== PERSISTENCE PATHS ==="
echo "HOST_SERVER_DATA_DIR=${HOST_SERVER_DATA_DIR}"
echo "HOST_RUNTIME_ANALYSIS_DIR=${HOST_RUNTIME_ANALYSIS_DIR}"
echo "HOST_MODELS_DIR=${HOST_MODELS_DIR}"
ls -ld "${HOST_SERVER_DATA_DIR}" "${HOST_RUNTIME_ANALYSIS_DIR}" "${HOST_MODELS_DIR}" 2>/dev/null || true
echo "=== DATA FILES ==="
ls -lah "${HOST_SERVER_DATA_DIR}" 2>/dev/null || true
echo "=== DOCKER COMPOSE PS ==="
HOST_SERVER_DATA_DIR="${HOST_SERVER_DATA_DIR}" HOST_RUNTIME_ANALYSIS_DIR="${HOST_RUNTIME_ANALYSIS_DIR}" HOST_MODELS_DIR="${HOST_MODELS_DIR}" ${DOCKER_COMPOSE_CMD} --env-file .env.production ps || true
echo "=== DOCKER PS ==="
sudo docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
echo "=== BACKEND LOGS ==="
HOST_SERVER_DATA_DIR="${HOST_SERVER_DATA_DIR}" HOST_RUNTIME_ANALYSIS_DIR="${HOST_RUNTIME_ANALYSIS_DIR}" HOST_MODELS_DIR="${HOST_MODELS_DIR}" ${DOCKER_COMPOSE_CMD} --env-file .env.production logs --tail=80 backend || true
echo "=== FRONTEND LOGS ==="
HOST_SERVER_DATA_DIR="${HOST_SERVER_DATA_DIR}" HOST_RUNTIME_ANALYSIS_DIR="${HOST_RUNTIME_ANALYSIS_DIR}" HOST_MODELS_DIR="${HOST_MODELS_DIR}" ${DOCKER_COMPOSE_CMD} --env-file .env.production logs --tail=80 frontend || true
EOF
