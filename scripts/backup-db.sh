#!/usr/bin/env bash
# Back up the Findash SQLite DB to a timestamped copy, keeping the last N.
# Uses SQLite's online backup so it's safe even while the app is running.
#
# Usage:  bash scripts/backup-db.sh
# Cron (daily 02:30):  30 2 * * * /home/ubuntu/finance/scripts/backup-db.sh >> /home/ubuntu/finance/logs/backup.log 2>&1
set -euo pipefail

DB="${DB_PATH:-$HOME/finance/server-py/dev.db}"
DEST="${BACKUP_DIR:-$HOME/finance-backups}"
KEEP="${KEEP:-14}"          # how many backups to retain

mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/findash-$STAMP.db"

# Consistent snapshot via SQLite's .backup (safe during writes)
sqlite3 "$DB" ".backup '$OUT'"
gzip -f "$OUT"
echo "$(date -Is) backed up -> $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"

# Prune old backups, keep newest $KEEP
ls -1t "$DEST"/findash-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(date -Is) retained newest $KEEP backups in $DEST"
