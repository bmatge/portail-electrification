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

# .env beta (à créer)
cat > .env <<EOF
DOMAIN=latelier-beta.bercy.matge.com
NODE_ENV=production
MAILER_DRIVER=console
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
