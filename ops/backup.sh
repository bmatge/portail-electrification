#!/bin/sh
# Sauvegarde SQLite quotidienne. Utilise `sqlite3 .backup` qui prend un
# snapshot cohérent même si l'app écrit en parallèle (WAL préservé).
# Rétention : supprime les .db de plus de BACKUP_RETENTION_DAYS (défaut 30).
#
# Pour restaurer en prod :
#   docker compose stop app
#   docker cp <container-backup>:/backups/app-YYYY-MM-DD.db ./restore.db
#   docker run --rm -v app-data:/data -v $PWD:/host alpine \
#     cp /host/restore.db /data/app.db
#   docker compose start app
# Cf. docs/ops/restore.md.

set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
SRC=/data/app.db
DEST="/backups/app-$(date +%F).db"

if [ ! -f "$SRC" ]; then
  echo "[backup] source $SRC introuvable, skip"
  exit 0
fi

mkdir -p /backups
echo "[backup] $(date -Iseconds) → $DEST"
sqlite3 "$SRC" ".backup $DEST"

# Rétention : delete files older than RETENTION_DAYS
find /backups -name 'app-*.db' -mtime "+$RETENTION_DAYS" -delete

echo "[backup] done, $(ls /backups | wc -l) snapshots, $(du -sh /backups | cut -f1) total"
