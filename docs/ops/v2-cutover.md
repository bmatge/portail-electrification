# Bascule v1 → v2 (procédure de cutover)

Phase 9 du plan de refacto v2. À exécuter quand v2 est prête à remplacer
v1 en prod. Comm équipe 48h avant.

## Pré-requis

- Branche `v2` mergée dans `main` (PR validée, CI verte).
- Tag `v1-final` posé sur le dernier commit `main` avant merge.
- Dump SQLite récent depuis prod copié sur staging et validé : la procédure
  ci-dessous a tourné une fois sans erreur sur ce dump.
- `seed-invites.ts` préparé avec la liste des ~10 users actifs et leurs
  emails (cf. annexe ci-dessous). À écrire en parallèle si pas encore fait.

## Séquencement (≈ 10 min de downtime)

1. **Comm** : "L'atelier indisponible pendant 10 min pour mise à jour v2. Vous
   recevrez un email de reconnexion."
2. **Backup manuel** (sécurité, en plus du sidecar quotidien) :
   ```sh
   ssh vps
   cd ~/latelier-cadrage-site
   docker compose exec backup /usr/local/bin/backup.sh
   docker compose cp backup:/backups/app-$(date +%F).db ./prebascule.db
   ```
3. **Pull v2 + build** :
   ```sh
   git fetch && git checkout main
   ./deploy.sh --no-pull  # pull manuel ci-dessus, on build seulement
   # ou : docker compose down && git pull && docker compose up -d --build
   ```
4. **Vérifier les migrations 0005-0009** dans les logs :
   ```sh
   docker compose logs app | grep "migrations appliquées"
   # Attendu : 0005_users_v2.sql, 0006_projects_created_by.sql,
   # 0007_auth.sql, 0008_rbac.sql, 0009_sessions_v2.sql
   ```
   À ce stade :
   - Les sessions v1 sont invalidées (DROP TABLE par 0009).
   - Les users existants ont `display_name = ancien name`, `email = NULL`.
5. **Onboarder les users legacy** (rôles + email) :
   ```sh
   # Variante interactive (à écrire ; cf. ops/seed-invites.ts dans le plan)
   docker compose exec app node server/dist/ops/seed-invites.js \
     --file /app/data/invites.json
   ```
   Le format attendu (`invites.json`) :
   ```json
   [
     { "legacy_name": "Bertrand", "email": "bertrand@matge.com", "role": "admin" },
     { "legacy_name": "Alice", "email": "alice@bercy.gouv.fr", "role": "editor" }
   ]
   ```
   Pour chaque entrée, le script :
   - retrouve l'user par `display_name = legacy_name`
   - met `email = …`, `status = 'pending'`
   - accorde le rôle global demandé
   - envoie un magic link (driver SMTP réel ici, **pas le console mailer**)
6. **Smoke test** :
   ```sh
   curl -s https://latelier.bercy.matge.com/api/health | jq .
   # → {"ok":true}
   curl -sI https://latelier.bercy.matge.com/
   # → 200, CSP/HSTS/X-CTO présents
   ```
7. **Vérification UI** : ouvrir la SPA, login magic link avec son propre email,
   vérifier que la liste des projets s'affiche et que l'arborescence du projet
   historique est intacte.

## Rollback (si quelque chose explose)

Le tag `v1-final` permet de revenir vite :

```sh
ssh vps
cd ~/latelier-cadrage-site
git checkout v1-final
docker compose down
docker compose up -d --build
# Restaurer la DB pré-bascule
docker run --rm -v latelier-cadrage-site_app-data:/data -v $PWD:/host \
  alpine sh -c 'cp /host/prebascule.db /data/app.db && rm -f /data/app.db-wal /data/app.db-shm'
docker compose restart app
```

Cf. `docs/ops/restore.md` pour le détail de la restauration.

## Vérifications transversales (cf. plan §Vérification end-to-end)

| #   | Check                    | Résultat attendu                                                                     |
| --- | ------------------------ | ------------------------------------------------------------------------------------ |
| 1   | CI verte                 | tous les jobs GitHub Actions passent                                                 |
| 2   | Régression fonctionnelle | snapshot diff vide entre GET v1 et GET v2 (sauf champs nouveaux comme `users.email`) |
| 3   | Bundle round-trip        | `docs/bundle-example.json` → import → export → diff vide                             |
| 4   | Auth flow complet        | curl `/api/auth/magic-link` → callback → `/api/me` retourne user + roles             |
| 5   | Self-signup              | nouvel email reçoit viewer global, pas d'écriture sans grant explicite               |
| 6   | RBAC                     | viewer 403 sur PUT /tree, editor 200, editor 403 sur DELETE projet d'autrui          |
| 7   | Optimistic locking       | If-Match désynchronisé → 409 + body `{ error, head }`                                |
| 8   | Backup local             | snapshot quotidien créé dans le volume `backup-data` ; restore testé                 |
| 9   | Headers sécurité         | CSP / HSTS / X-CTO / Referrer-Policy présents                                        |
| 10  | Rate-limit               | 11e POST /auth/magic-link → 429                                                      |
| 11  | Ré-onboarding            | tous les users actifs ont `email` rempli, `revisions.author_id` intact               |

## Suivi post-bascule (semaine 1)

- Monitor `docker compose logs app --since=24h` chaque jour pour repérer
  les 5xx ou les patterns d'erreur récurrents.
- Vérifier que le sidecar backup tourne :
  `docker compose exec backup ls -lh /backups`
- Surveiller les 401/403 dans les logs : si plusieurs users actifs restent
  bloqués au login, vérifier que leur magic link n'est pas filtré par leur
  client mail.

## Hors scope cutover (à câbler post-merge)

- Mailer SMTP réel (driver `smtp` à câbler — Phase 8 fournit memory/console
  drivers ; production = console le temps qu'un SMTP soit branché).
- `ops/seed-invites.ts` (script TS dédié — à écrire avant le cutover réel).
- Bundling DSFR local (CSP pourra être strict après).
- Playwright e2e 3 parcours (login / édition tree / conflit lock).
