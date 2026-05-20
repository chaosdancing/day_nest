#!/usr/bin/env bash
# DayNest deploy
# Run on the VPS as root (or via `sudo`). Idempotent.
#
# Assumes:
#   - Repo is cloned at $REPO_ROOT (default /srv/daynest)
#   - /etc/daynest/.env exists with all required vars
#   - nginx already has /etc/nginx/sites-enabled/daynest.conf
#   - pm2 is installed globally (or use systemd path)
#
# Usage: bash deploy/scripts/deploy.sh [--no-pull] [--no-migrate]
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/srv/daynest}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/daynest}"
DATA_ROOT="${DATA_ROOT:-/var/lib/daynest}"
LOG_ROOT="${LOG_ROOT:-/var/log/daynest}"
ENV_FILE="${ENV_FILE:-/etc/daynest/.env}"
SERVICE_USER="${SERVICE_USER:-daynest}"
SERVICE_MANAGER="${SERVICE_MANAGER:-pm2}"   # pm2 | systemd

DO_PULL=1
DO_MIGRATE=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    --no-migrate) DO_MIGRATE=0 ;;
    *) echo "unknown arg: $arg"; exit 1 ;;
  esac
done

log() { printf "\033[1;34m==>\033[0m %s\n" "$*"; }

[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE"; exit 1; }

log "Ensuring dirs"
mkdir -p "$DEPLOY_ROOT/api" "$DEPLOY_ROOT/web" "$DATA_ROOT" "$LOG_ROOT"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_ROOT" "$LOG_ROOT"

cd "$REPO_ROOT"

if [[ $DO_PULL -eq 1 ]]; then
  log "git pull"
  sudo -u "$SERVICE_USER" git pull --ff-only
fi

log "Installing deps (frozen lockfile)"
sudo -u "$SERVICE_USER" pnpm install --frozen-lockfile

log "Building @daynest/shared"
sudo -u "$SERVICE_USER" pnpm --filter @daynest/shared build

log "Building @daynest/api"
sudo -u "$SERVICE_USER" pnpm --filter @daynest/api build

log "Building @daynest/web"
sudo -u "$SERVICE_USER" pnpm --filter @daynest/web build

if [[ $DO_MIGRATE -eq 1 ]]; then
  log "Applying database migrations"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  sudo -u "$SERVICE_USER" -E pnpm --filter @daynest/api exec prisma migrate deploy
fi

log "Syncing API artifacts"
rsync -a --delete \
  --include='dist/' --include='dist/**' \
  --include='prisma/' --include='prisma/**' \
  --include='package.json' --include='node_modules/' --include='node_modules/**' \
  --exclude='*' \
  "$REPO_ROOT/apps/api/" "$DEPLOY_ROOT/api/"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$DEPLOY_ROOT/api"

log "Syncing web artifacts"
rsync -a --delete "$REPO_ROOT/apps/web/dist/" "$DEPLOY_ROOT/web/"
chown -R www-data:www-data "$DEPLOY_ROOT/web" || true

log "Restarting API ($SERVICE_MANAGER)"
case "$SERVICE_MANAGER" in
  pm2)
    if sudo -u "$SERVICE_USER" pm2 describe daynest-api > /dev/null 2>&1; then
      sudo -u "$SERVICE_USER" pm2 reload daynest-api --update-env
    else
      sudo -u "$SERVICE_USER" pm2 start "$REPO_ROOT/deploy/pm2/ecosystem.config.cjs"
      sudo -u "$SERVICE_USER" pm2 save
    fi
    ;;
  systemd)
    systemctl restart daynest-api.service
    ;;
  *) echo "unknown SERVICE_MANAGER: $SERVICE_MANAGER"; exit 1 ;;
esac

log "Reloading nginx"
nginx -t
systemctl reload nginx

log "Deploy complete"
