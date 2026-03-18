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
SSH_KEY="${SSH_KEY:-}"

if [[ -z "${SSH_KEY}" ]]; then
  echo "SSH_KEY is required."
  echo "Example:"
  echo "  SSH_KEY=/path/to/key.pem ${BASH_SOURCE[0]}"
  exit 1
fi

ssh -i "${SSH_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
set -euo pipefail
PERSISTENCE_ROOT="${PERSISTENCE_ROOT}"
cd "${DEPLOY_PATH}"
sudo mkdir -p "${HOST_SERVER_DATA_DIR}" "${HOST_RUNTIME_ANALYSIS_DIR}"
sudo chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${PERSISTENCE_ROOT}"
HOST_SERVER_DATA_DIR="${HOST_SERVER_DATA_DIR}" \
HOST_RUNTIME_ANALYSIS_DIR="${HOST_RUNTIME_ANALYSIS_DIR}" \
node tools/recover_runtime_state.cjs \
  --data-dir "${HOST_SERVER_DATA_DIR}" \
  --runtime-dir "${HOST_RUNTIME_ANALYSIS_DIR}" \
  --container-runtime-dir "/app/runtime-analysis"
echo "=== media-sources.json ==="
cat "${HOST_SERVER_DATA_DIR}/media-sources.json"
echo
echo "=== analysis-history.json ==="
cat "${HOST_SERVER_DATA_DIR}/analysis-history.json"
EOF
