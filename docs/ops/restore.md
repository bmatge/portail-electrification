# Restauration d'un backup SQLite

Procédure documentée pour récupérer un snapshot du sidecar `backup`.
Hypothèse : la DB de prod est corrompue / écrasée / un dropTable malencontreux.

## 1. Lister les snapshots disponibles

```sh
docker compose exec backup ls -lh /backups
```

Format attendu : `app-YYYY-MM-DD.db` (un par jour, rétention 30 jours par défaut).

## 2. Copier le snapshot choisi sur l'hôte

```sh
docker compose cp backup:/backups/app-2026-05-15.db ./restore.db
ls -lh ./restore.db   # sanity : taille comparable à la DB live
```

## 3. Arrêter l'app

```sh
docker compose stop app
```

## 4. Remplacer la DB live par le snapshot

Le volume `app-data` est nommé, on monte un alpine éphémère pour faire la
substitution :

```sh
docker run --rm \
  -v latelier-cadrage-site_app-data:/data \
  -v $PWD:/host \
  alpine cp /host/restore.db /data/app.db

# Supprime les fichiers WAL/SHM résiduels (le snapshot est auto-suffisant)
docker run --rm \
  -v latelier-cadrage-site_app-data:/data \
  alpine sh -c 'rm -f /data/app.db-wal /data/app.db-shm'
```

(Le nom du volume `latelier-cadrage-site_app-data` est le `<project>_<volume>`
de Compose. Vérifier avec `docker volume ls`.)

## 5. Redémarrer l'app + vérifier

```sh
docker compose start app
docker compose logs app --tail=50
curl -s http://localhost:3000/api/health
```

## 6. Sessions

Le redémarrage avec un snapshot ancien peut remettre des sessions expirées
en circulation. Les `attach-user` middleware vérifient `expires_at > now`, donc
les sessions plus vieilles que 30 jours seront ignorées. Les utilisateurs qui
étaient connectés à la date du snapshot peuvent garder leur session.

Pour invalider tout en bloc :

```sh
docker compose exec app sqlite3 /data/app.db \
  "UPDATE sessions SET revoked_at = datetime('now') WHERE revoked_at IS NULL;"
```

## Test de restore (à faire trimestriellement)

1. Choisir un snapshot du dernier mois.
2. Refaire les étapes 2-5 sur l'environnement de staging.
3. Vérifier qu'un user existant peut se reconnecter (magic link) et que les
   projets / tree / roadmap sont intacts.

Si erreur : le snapshot est corrompu. Investiguer le sidecar backup
(`docker compose logs backup`). Cf. `docs/ops/sqlite.md`.
