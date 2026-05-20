#!/usr/bin/env bash
# DayNest SQLite snapshot -> gzip -> upload to Qiniu
# Designed to run as the daynest user via cron. Exits non-zero on failure
# so cron mail surfaces the problem.
#
# Required env (in /etc/daynest/.env):
#   DATABASE_URL=file:/var/lib/daynest/daynest.db
#   QINIU_ACCESS_KEY, QINIU_SECRET_KEY
#   BACKUP_QINIU_BUCKET, BACKUP_QINIU_KEY_PREFIX
#
# Dependencies: sqlite3, gzip, curl, openssl, jq, node (for upload-token helper)
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/daynest/.env}"
LOCAL_DIR="${LOCAL_DIR:-/var/lib/daynest/backups}"
RETAIN_LOCAL="${RETAIN_LOCAL:-30}"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

DB_FILE="${DATABASE_URL#file:}"
[[ -f "$DB_FILE" ]] || { echo "DB file not found: $DB_FILE"; exit 1; }

mkdir -p "$LOCAL_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
SNAP="$LOCAL_DIR/daynest-$STAMP.db"
GZ="$SNAP.gz"

echo "[backup] taking atomic snapshot to $SNAP"
sqlite3 "$DB_FILE" ".backup '$SNAP'"

echo "[backup] gzipping"
gzip -9 "$SNAP"

KEY="${BACKUP_QINIU_KEY_PREFIX:-sqlite/}daynest-$STAMP.db.gz"
echo "[backup] uploading to qiniu://$BACKUP_QINIU_BUCKET/$KEY"

# Build a put-policy and upload token using bundled Node helper
TOKEN_JSON="$(NODE_NO_WARNINGS=1 node "$(dirname "$0")/_qiniu-token.cjs" \
  "$QINIU_ACCESS_KEY" "$QINIU_SECRET_KEY" "$BACKUP_QINIU_BUCKET" "$KEY")"
TOKEN="$(printf '%s' "$TOKEN_JSON" | jq -r .token)"

HTTP_CODE=$(curl -s -o /tmp/qiniu-resp.txt -w "%{http_code}" \
  -F "token=$TOKEN" \
  -F "key=$KEY" \
  -F "file=@$GZ" \
  https://upload.qiniup.com/)

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[backup] upload failed: HTTP $HTTP_CODE"
  cat /tmp/qiniu-resp.txt || true
  exit 2
fi

echo "[backup] upload ok"

# Prune local files
echo "[backup] pruning local snapshots older than top-$RETAIN_LOCAL"
ls -1t "$LOCAL_DIR"/daynest-*.db.gz 2>/dev/null \
  | tail -n +$((RETAIN_LOCAL + 1)) \
  | xargs -r rm -f

echo "[backup] done $KEY"
