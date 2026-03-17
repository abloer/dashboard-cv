#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEPLOY_USER="${DEPLOY_USER:-sysadm2}"
DEPLOY_HOST="${DEPLOY_HOST:-103.127.98.173}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/hosting/apps/vision}"
SSH_KEY="${SSH_KEY:-}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD:-sudo docker compose}"
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

ssh -i "${SSH_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "mkdir -p '$(dirname "${DEPLOY_PATH}")' '${DEPLOY_PATH}' '${DEPLOY_PATH}/runtime-analysis' '${DEPLOY_PATH}/server/data' '${DEPLOY_PATH}/models'"

if [[ "${SYNC_ENV}" == "1" ]]; then
  echo "Syncing .env.production"
  scp -i "${SSH_KEY}" "${PROJECT_ROOT}/.env.production" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/.env.production"
fi

if [[ "${SYNC_MODELS}" == "1" && -d "${PROJECT_ROOT}/models" ]]; then
  echo "Syncing models/"
  rsync -az --delete \
    -e "ssh -i ${SSH_KEY}" \
    "${PROJECT_ROOT}/models/" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/models/"
fi

ssh -i "${SSH_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH}"
REPO_URL="${REPO_URL}"
DEPLOY_REF="${DEPLOY_REF}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD}"

migrate_to_git_repo() {
  local backup_root
  backup_root="\$(mktemp -d)"

  if [[ -d "\${DEPLOY_PATH}/runtime-analysis" ]]; then
    mv "\${DEPLOY_PATH}/runtime-analysis" "\${backup_root}/runtime-analysis"
  fi

  if [[ -d "\${DEPLOY_PATH}/server/data" ]]; then
    mkdir -p "\${backup_root}/server"
    mv "\${DEPLOY_PATH}/server/data" "\${backup_root}/server/data"
  fi

  if [[ -d "\${DEPLOY_PATH}/models" ]]; then
    mv "\${DEPLOY_PATH}/models" "\${backup_root}/models"
  fi

  if [[ -f "\${DEPLOY_PATH}/.env.production" ]]; then
    mv "\${DEPLOY_PATH}/.env.production" "\${backup_root}/.env.production"
  fi

  find "\${DEPLOY_PATH}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  git clone "\${REPO_URL}" "\${DEPLOY_PATH}"

  mkdir -p "\${DEPLOY_PATH}/server"

  if [[ -d "\${backup_root}/runtime-analysis" ]]; then
    mv "\${backup_root}/runtime-analysis" "\${DEPLOY_PATH}/runtime-analysis"
  else
    mkdir -p "\${DEPLOY_PATH}/runtime-analysis"
  fi

  if [[ -d "\${backup_root}/server/data" ]]; then
    mv "\${backup_root}/server/data" "\${DEPLOY_PATH}/server/data"
  else
    mkdir -p "\${DEPLOY_PATH}/server/data"
  fi

  if [[ -d "\${backup_root}/models" ]]; then
    mv "\${backup_root}/models" "\${DEPLOY_PATH}/models"
  else
    mkdir -p "\${DEPLOY_PATH}/models"
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

cd "\${DEPLOY_PATH}"
\${DOCKER_COMPOSE_CMD} --env-file .env.production build
\${DOCKER_COMPOSE_CMD} --env-file .env.production up -d
\${DOCKER_COMPOSE_CMD} --env-file .env.production ps
echo "--- deployed revision ---"
git rev-parse HEAD
git log --oneline -n 1
EOF
