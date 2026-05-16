# SQLite — caveats opérationnels

## À ne JAMAIS faire en prod

- **Ne pas appeler `db.pragma('wal_checkpoint')` depuis le code applicatif.**
  SQLite gère le WAL automatiquement ; un checkpoint manuel coupe la séquence
  attendue par Litestream (cf. v1.1) et peut bloquer momentanément les
  lectures concurrentes.
- **Ne pas appeler `VACUUM` depuis l'app** ni via un script automatique.
  `VACUUM` recrée le fichier DB entier (lock exclusif, taille \* 2 sur disque
  pendant l'opération). En cas de besoin réel (DB obèse, beaucoup de DELETE),
  exécuter manuellement hors heures de bureau, **app arrêtée**.
- **Ne pas ouvrir `sqlite3` en mode écriture sur la DB live.** Le shell SQLite
  prend un lock qui bloque les writes du serveur. Pour inspecter, utiliser
  `sqlite3 -readonly /data/app.db` ou faire une copie via le sidecar backup.
- **Ne pas `cp` la DB pendant que l'app tourne.** Le WAL est en cours d'écriture,
  la copie sera incohérente. Toujours :
  1. `docker compose stop app`
  2. `cp -a` (préserve permissions + timestamps)
  3. `docker compose start app`
     Ou utiliser le sidecar `backup` qui fait `sqlite3 .backup` (snapshot
     cohérent à chaud, sans arrêt de service).

## Pragmas activés au boot par `db/client.ts`

- `journal_mode = WAL` — concurrent reads + single writer, performance
  bonne et compatibilité Litestream future.
- `foreign_keys = ON` — applique les FK déclarées dans les migrations (sinon
  SQLite les ignore, par historique).

## Évolution prévue v1.1

- **Litestream → S3/MinIO** : backup continu off-site. Le `litestream.yml`
  template sera ajouté à `docs/ops/` quand un bucket sera dispo.
- **Test de restore trimestriel** : à formaliser une fois Litestream actif.

## Backup local v1 (en place)

Sidecar `backup` dans `docker-compose.yml` qui exécute `ops/backup.sh` à
03:00 chaque jour. RPO = 24h. Rétention 30 jours (configurable via
`BACKUP_RETENTION_DAYS`). Volume `backup-data` séparé du volume `app-data`.

Pour vérifier que le cron tourne :

```sh
docker compose exec backup ls -lh /backups
docker compose logs backup --tail=20
```
