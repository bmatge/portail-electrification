# Déploiement beta v2 (parallèle à la v1 prod)

Permet de faire vivre la v2 sur `latelier-beta.bercy.matge.com` sans
toucher à la v1 qui reste sur `latelier.bercy.matge.com`. Les deux
containers cohabitent dans le même `ecosystem-network` Traefik.

## DNS

Ajouter un enregistrement A/AAAA `latelier-beta.bercy.matge.com` qui
pointe vers le VPS (même IP que `latelier.bercy.matge.com`). Traefik
fait le routing par Host.

## Premier déploiement sur le VPS

```sh
ssh vps

# Clone séparé du repo
git clone git@github.com:bmatge/latelier-cadrage-site.git ~/latelier-cadrage-site-beta
cd ~/latelier-cadrage-site-beta
git checkout v2

# .env beta (à créer) — emails admin séparés par virgule
cat > .env <<EOF
DOMAIN=latelier-beta.bercy.matge.com
NODE_ENV=production
MAILER_DRIVER=console
BOOTSTRAP_ADMIN_EMAILS=bertrand@matge.com
EOF

# Build + up avec l'overlay beta
docker compose -f docker-compose.yml -f docker-compose.beta.yml up -d --build

# Vérif
docker compose -f docker-compose.yml -f docker-compose.beta.yml ps
docker compose -f docker-compose.yml -f docker-compose.beta.yml logs app -f
```

Une fois Traefik a obtenu le cert Let's Encrypt :

```sh
curl -I https://latelier-beta.bercy.matge.com
# → 200, headers HSTS/CSP/X-CTO
curl -s https://latelier-beta.bercy.matge.com/api/health
# → {"ok":true}
```

## Bootstrap admin (premier login)

La page `/admin` n'est visible qu'aux users avec rôle `admin` global.
Or le self-signup donne `viewer`. Deux mécanismes pour obtenir l'admin :

### Option 1 — Variable d'env au démarrage (recommandé)

Mettre `BOOTSTRAP_ADMIN_EMAILS=bertrand@matge.com,autre@bercy.gouv.fr`
dans le `.env`. Au boot du serveur, chaque email :

- est créé si absent (status `active`, display_name = partie locale)
- reçoit un grant `admin global` (idempotent — ne refait rien si
  déjà admin).

L'user n'a même pas besoin d'exister au préalable. Il peut ensuite
demander un magic link sur la page Login et se logger avec son admin
déjà préparé.

### Option 2 — Script CLI sans redémarrage

Si tu as oublié de set la variable au boot et que l'user existe déjà
(via self-signup) en `viewer` :

```sh
docker compose -f docker-compose.yml -f docker-compose.beta.yml exec app \
  node --experimental-strip-types /app/ops/grant-admin.ts bertrand@matge.com
```

L'effet est immédiat — pas besoin de redémarrer. La prochaine requête
de l'user (ou un rechargement de page) refait `/api/me` qui retourne
le nouveau rôle.

## Données

La beta démarre avec une **DB vide** (volume `app-data-beta` neuf). Le
projet historique sera créé par `seedDefaultProject()` au premier
boot. Tu pourras :

- soit créer des projets de test via la SPA
- soit importer des bundles JSON exportés depuis la v1 prod (export
  via `/api/projects/:slug/export` côté prod → upload côté beta via
  `POST /api/projects/import`)

## Mises à jour

```sh
ssh vps
cd ~/latelier-cadrage-site-beta
git pull
docker compose -f docker-compose.yml -f docker-compose.beta.yml up -d --build
```

Les sauvegardes quotidiennes tournent automatiquement via le sidecar
`backup` (volume `backup-data-beta` séparé du backup prod).

## Quand finir la beta

Une fois la parité UI atteinte et validée par l'équipe :

1. Tag `v1-final` sur le dernier commit `main` de la v1
2. Suivre `docs/ops/v2-cutover.md` côté prod (`~/latelier-cadrage-site`)
3. Supprimer la beta :
   ```sh
   cd ~/latelier-cadrage-site-beta
   docker compose -f docker-compose.yml -f docker-compose.beta.yml down -v
   cd ~ && rm -rf ~/latelier-cadrage-site-beta
   ```
4. Retirer le DNS `latelier-beta.bercy.matge.com`
