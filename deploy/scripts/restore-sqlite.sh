#!/usr/bin/env bash
# Restore a SQLite snapshot from Qiniu.
# Usage:
#   bash restore-sqlite.sh                  # interactive list + pick
#   bash restore-sqlite.sh daynest-20260520-033000.db.gz
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/daynest/.env}"
SERVICE_USER="${SERVICE_USER:-daynest}"
SERVICE_MANAGER="${SERVICE_MANAGER:-pm2}"
LOCAL_DIR="${LOCAL_DIR:-/var/lib/daynest/backups}"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
DB_FILE="${DATABASE_URL#file:}"

KEY="${1:-}"
if [[ -z "$KEY" ]]; then
  echo "[restore] listing recent local snapshots:"
  ls -1t "$LOCAL_DIR"/daynest-*.db.gz 2>/dev/null | head -20 || true
  echo "(re-run this script with the snapshot filename to restore;"
  echo " or fetch from Qiniu console)"
  exit 0
fi

mkdir -p "$LOCAL_DIR"
LOCAL_FILE="$LOCAL_DIR/$KEY"
if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "[restore] local copy missing; download from Qiniu first:"
  echo "  qshell rget $BACKUP_QINIU_BUCKET ${BACKUP_QINIU_KEY_PREFIX}$KEY $LOCAL_FILE"
  exit 1
fi

echo "[restore] stopping service"
case "$SERVICE_MANAGER" in
  pm2) sudo -u "$SERVICE_USER" pm2 stop daynest-api ;;
  systemd) systemctl stop daynest-api.service ;;
esac

echo "[restore] backing up current DB to ${DB_FILE}.pre-restore"
[[ -f "$DB_FILE" ]] && cp "$DB_FILE" "${DB_FILE}.pre-restore"

echo "[restore] applying snapshot $LOCAL_FILE"
gunzip -c "$LOCAL_FILE" > "$DB_FILE.tmp"
mv "$DB_FILE.tmp" "$DB_FILE"
chown "$SERVICE_USER":"$SERVICE_USER" "$DB_FILE"

echo "[restore] sanity check"
sqlite3 "$DB_FILE" 'SELECT COUNT(*) AS users FROM User; SELECT COUNT(*) AS collections FROM Collection; SELECT COUNT(*) AS photos FROM Photo;'

echo "[restore] starting service"
case "$SERVICE_MANAGER" in
  pm2) sudo -u "$SERVICE_USER" pm2 start daynest-api ;;
  systemd) systemctl start daynest-api.service ;;
esac

echo "[restore] done"
