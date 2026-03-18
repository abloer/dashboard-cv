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
SYNC_ENV="${SYNC_ENV:-1}"
SYNC_MODELS="${SYNC_MODELS:-1}"

LOCAL_BRANCH="$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
if [[ "${LOCAL_BRANCH}" == "HEAD" ]]; then
  LOCAL_BRANCH="main"
fi

DEPLOY_REF="${DEPLOY_REF:-${LOCAL_BRANCH}}"
REPO_URL="${REPO_URL:-$(git -C "${PROJECT_ROOT}" remote get-url origin 2>/dev/null || true)}"

if [[ -z "${SSH_KEY}" ]]; then
  echo "SSH_KEY is required."
  echo "Example:"
  echo "  SSH_KEY=/path/to/key.pem ${BASH_SOURCE[0]}"
  exit 1
fi

if [[ -z "${REPO_URL}" ]]; then
  echo "REPO_URL could not be resolved from local git remote."
  echo "Set it explicitly, for example:"
  echo "  REPO_URL=https://github.com/abloer/dashboard-cv.git ${BASH_SOURCE[0]}"
  exit 1
fi

if [[ "${SYNC_ENV}" == "1" && ! -f "${PROJECT_ROOT}/.env.production" ]]; then
  echo ".env.production not found in ${PROJECT_ROOT}"
  echo "Create it first, or run with SYNC_ENV=0 if the server already has one."
  exit 1
fi

echo "Deploy target: ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
echo "Repository: ${REPO_URL}"
echo "Ref: ${DEPLOY_REF}"
echo "Persistence root: ${PERSISTENCE_ROOT}"

ssh -i "${SSH_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "sudo mkdir -p '$(dirname "${DEPLOY_PATH}")' '${DEPLOY_PATH}' '${PERSISTENCE_ROOT}' '${HOST_RUNTIME_ANALYSIS_DIR}' '${HOST_SERVER_DATA_DIR}' '${HOST_MODELS_DIR}' && sudo chown -R ${DEPLOY_USER}:${DEPLOY_USER} '${DEPLOY_PATH}' '${PERSISTENCE_ROOT}'"

if [[ "${SYNC_ENV}" == "1" ]]; then
  echo "Syncing .env.production"
  scp -i "${SSH_KEY}" "${PROJECT_ROOT}/.env.production" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/.env.production"
fi

if [[ "${SYNC_MODELS}" == "1" && -d "${PROJECT_ROOT}/models" ]]; then
  echo "Syncing models/"
  rsync -az --delete \
    -e "ssh -i ${SSH_KEY}" \
    "${PROJECT_ROOT}/models/" "${DEPLOY_USER}@${DEPLOY_HOST}:${HOST_MODELS_DIR}/"
fi

ssh -i "${SSH_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH}"
REPO_URL="${REPO_URL}"
DEPLOY_REF="${DEPLOY_REF}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD}"
HOST_SERVER_DATA_DIR="${HOST_SERVER_DATA_DIR}"
HOST_RUNTIME_ANALYSIS_DIR="${HOST_RUNTIME_ANALYSIS_DIR}"
HOST_MODELS_DIR="${HOST_MODELS_DIR}"

migrate_persistent_dir() {
  local legacy_path="\$1"
  local persistent_path="\$2"
  mkdir -p "\${persistent_path}"
  if [[ -d "\${legacy_path}" ]] && find "\${legacy_path}" -mindepth 1 -print -quit >/dev/null 2>&1; then
    cp -a "\${legacy_path}/." "\${persistent_path}/"
  fi
}

migrate_to_git_repo() {
  local backup_root
  backup_root="\$(mktemp -d)"

  if [[ -d "\${HOST_RUNTIME_ANALYSIS_DIR}" ]]; then
    mkdir -p "\${backup_root}/runtime-analysis"
    cp -a "\${HOST_RUNTIME_ANALYSIS_DIR}/." "\${backup_root}/runtime-analysis/" 2>/dev/null || true
  fi

  if [[ -d "\${HOST_SERVER_DATA_DIR}" ]]; then
    mkdir -p "\${backup_root}/server/data"
    cp -a "\${HOST_SERVER_DATA_DIR}/." "\${backup_root}/server/data/" 2>/dev/null || true
  fi

  if [[ -d "\${HOST_MODELS_DIR}" ]]; then
    mkdir -p "\${backup_root}/models"
    cp -a "\${HOST_MODELS_DIR}/." "\${backup_root}/models/" 2>/dev/null || true
  fi

  if [[ -f "\${DEPLOY_PATH}/.env.production" ]]; then
    mv "\${DEPLOY_PATH}/.env.production" "\${backup_root}/.env.production"
  fi

  find "\${DEPLOY_PATH}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  git clone "\${REPO_URL}" "\${DEPLOY_PATH}"

  mkdir -p "\${DEPLOY_PATH}/server"

  mkdir -p "\${HOST_RUNTIME_ANALYSIS_DIR}" "\${HOST_SERVER_DATA_DIR}" "\${HOST_MODELS_DIR}"

  if [[ -d "\${backup_root}/runtime-analysis" ]]; then
    cp -a "\${backup_root}/runtime-analysis/." "\${HOST_RUNTIME_ANALYSIS_DIR}/"
  fi

  if [[ -d "\${backup_root}/server/data" ]]; then
    cp -a "\${backup_root}/server/data/." "\${HOST_SERVER_DATA_DIR}/"
  fi

  if [[ -d "\${backup_root}/models" ]]; then
    cp -a "\${backup_root}/models/." "\${HOST_MODELS_DIR}/"
  fi

  if [[ -f "\${backup_root}/.env.production" ]]; then
    mv "\${backup_root}/.env.production" "\${DEPLOY_PATH}/.env.production"
  fi
}

checkout_ref() {
  cd "\${DEPLOY_PATH}"
  git remote set-url origin "\${REPO_URL}"
  git fetch origin --prune --tags

  if git show-ref --verify --quiet "refs/remotes/origin/\${DEPLOY_REF}"; then
    git checkout -B "\${DEPLOY_REF}" "origin/\${DEPLOY_REF}"
    git reset --hard "origin/\${DEPLOY_REF}"
  else
    git checkout "\${DEPLOY_REF}"
  fi
}

if [[ ! -d "\${DEPLOY_PATH}/.git" ]]; then
  echo "Server path is not a git repository. Migrating deployment directory to git-based layout."
  migrate_to_git_repo
fi

checkout_ref

migrate_persistent_dir "\${DEPLOY_PATH}/runtime-analysis" "\${HOST_RUNTIME_ANALYSIS_DIR}"
migrate_persistent_dir "\${DEPLOY_PATH}/server/data" "\${HOST_SERVER_DATA_DIR}"
migrate_persistent_dir "\${DEPLOY_PATH}/models" "\${HOST_MODELS_DIR}"

cd "\${DEPLOY_PATH}"
HOST_SERVER_DATA_DIR="\${HOST_SERVER_DATA_DIR}" \
HOST_RUNTIME_ANALYSIS_DIR="\${HOST_RUNTIME_ANALYSIS_DIR}" \
HOST_MODELS_DIR="\${HOST_MODELS_DIR}" \
\${DOCKER_COMPOSE_CMD} --env-file .env.production build
HOST_SERVER_DATA_DIR="\${HOST_SERVER_DATA_DIR}" \
HOST_RUNTIME_ANALYSIS_DIR="\${HOST_RUNTIME_ANALYSIS_DIR}" \
HOST_MODELS_DIR="\${HOST_MODELS_DIR}" \
\${DOCKER_COMPOSE_CMD} --env-file .env.production up -d
HOST_SERVER_DATA_DIR="\${HOST_SERVER_DATA_DIR}" \
HOST_RUNTIME_ANALYSIS_DIR="\${HOST_RUNTIME_ANALYSIS_DIR}" \
HOST_MODELS_DIR="\${HOST_MODELS_DIR}" \
\${DOCKER_COMPOSE_CMD} --env-file .env.production ps
echo "--- deployed revision ---"
git rev-parse HEAD
git log --oneline -n 1
echo "--- persistence paths ---"
echo "HOST_SERVER_DATA_DIR=\${HOST_SERVER_DATA_DIR}"
echo "HOST_RUNTIME_ANALYSIS_DIR=\${HOST_RUNTIME_ANALYSIS_DIR}"
echo "HOST_MODELS_DIR=\${HOST_MODELS_DIR}"
EOF
