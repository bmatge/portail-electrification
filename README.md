# L'atelier 🪢 — refacto v2

Outil interne multi-projets pour cartographier l'arborescence, la roadmap,
les ressources et politiques publiques d'un portail web. Prod :
<https://latelier.bercy.matge.com> (legacy 301 :
<https://portail-elec.matge.com>).

> Branche `v2` — refacto profonde en cours. Cf. plan complet :
> `~/.claude/plans/maintenant-qu-on-a-rendu-eventual-abelson.md`. ADR :
> Obsidian vault → `30-Knowledge/ADR/ADR-010-refacto-v2-typescript-vue-rbac.md`.

## Monorepo (npm workspaces)

```
latelier-cadrage-site/
├─ shared/   — @latelier/shared : types Zod + RBAC permissions (back+front)
├─ server/   — @latelier/server : Express + TypeScript strict + Kysely + SQLite
├─ web/      — @latelier/web    : SPA Vue 3 + Vite + Pinia + vue-router
├─ docs/     — bundle format + ops (sqlite, restore, v2-cutover)
├─ ops/      — scripts shell (backup.sh)
└─ assets/   — legacy v1 (HTML/JS vanilla, sera supprimé après parité SPA)
```

## Quickstart dev

```sh
# Install
npm ci

# Build des workspaces (ordre : shared → server → web)
npm run build

# Test
npm test            # vitest run sur tous les workspaces
npm run lint
npm run format:check
npm run typecheck

# Dev (2 terminaux)
npm run -w @latelier/server dev   # tsx watch :3000
npm run -w @latelier/web dev      # vite :5173 (proxy /api → :3000)
```

## API

Toutes les routes sont sous `/api`. Cookie de session `pe_session` (httpOnly,
SameSite=Lax). Cf. [`docs/bundle-format.md`](docs/bundle-format.md) pour le
format des bundles d'import projet.

### Auth (v2 magic link)

- `POST /api/auth/magic-link { email }` — 204 (anti-énumération). Envoie un
  lien magique valide 15 min.
- `GET /api/auth/callback?token=…` — consomme, crée la session (cookie),
  redirige 303 vers `/` (ou réponse JSON si `Accept: application/json`).
- `POST /api/auth/logout` — révoque la session courante. 204.
- `POST /api/auth/logout-all` — révoque toutes les sessions du user. 204.
- `GET /api/me` — retourne `{ user: { id, display_name, email, status, roles } }`.

Self-signup ouvert : tout email peut recevoir un magic link et crée un user
avec rôle `viewer` global. Bloquable via `AUTH_ALLOWED_EMAIL_DOMAINS` (vide
par défaut). Cf. [shared/src/permissions.ts](shared/src/permissions.ts) pour
les permissions par rôle.

### Métier

| Méthode | URL | Permission requise |
|---|---|---|
| GET | `/api/projects` | `project:read` (global) |
| POST | `/api/projects` | `project:create` |
| GET | `/api/projects/:slug` | `project:read` |
| DELETE | `/api/projects/:slug` | `project:delete:own` (admin = `:any`) |
| GET | `/api/projects/:slug/export` | `project:export` |
| POST | `/api/projects/import` | `project:import` |
| GET | `/api/projects/:slug/tree` | `tree:read` |
| PUT | `/api/projects/:slug/tree` (If-Match: rev_id) | `tree:write` |
| GET | `/api/projects/:slug/history` | `tree:read` |
| GET | `/api/projects/:slug/revisions/:id` | `tree:read` |
| POST | `/api/projects/:slug/revisions/:id/revert` | `tree:revert` |
| GET | `/api/projects/:slug/roadmap` | `roadmap:read` |
| PUT | `/api/projects/:slug/roadmap` (If-Match: rev_id) | `roadmap:write` |
| GET | `/api/projects/:slug/comments[?node_id=…]` | `comments:read` |
| POST | `/api/projects/:slug/comments` | `comments:create` |
| DELETE | `/api/projects/:slug/comments/:id` | `comments:delete:own` (admin = `:any`) |
| GET | `/api/projects/:slug/data/:key` | `data:read` |
| PUT | `/api/projects/:slug/data/:key` | `data:write` |
| GET | `/api/admin/users` | `users:read` |
| POST | `/api/admin/users/:id/disable` | `users:disable` |
| POST | `/api/admin/users/:id/enable` | `users:disable` |
| POST | `/api/admin/users/:id/roles` | `roles:grant` |
| DELETE | `/api/admin/users/:id/roles` | `roles:revoke` |
| GET | `/api/admin/audit-log` | `audit:read` |

### Optimistic locking

Les PUT `/tree` et `/roadmap` exigent un header `If-Match: <revision_id>`. Si
la révision tête a changé entre le GET et le PUT, le serveur répond 409
`{ error: 'conflict', head: <RevisionSummary> }`. Le client doit recharger.

## Déploiement

`./deploy.sh [--no-pull] [--logs]` — build l'image Docker, restart le
conteneur, optionnellement suit les logs. Cf. [`docs/ops/v2-cutover.md`](docs/ops/v2-cutover.md)
pour la procédure de bascule v1 → v2 (~10 min downtime, ré-onboarding via
magic link).

## Backup & restore

Sidecar `backup` dans `docker-compose.yml` : `sqlite3 .backup` quotidien à
03:00, rétention 30 jours. Restore documenté dans [`docs/ops/restore.md`](docs/ops/restore.md).
Caveats SQLite à respecter en prod : [`docs/ops/sqlite.md`](docs/ops/sqlite.md).

## Reporté v1.1

- ProConnect / OIDC (DB schema déjà prêt — `auth_identities.provider IN
  ('local','proconnect')`)
- Litestream off-site (CRON local 24h en v1)
- SMTP réel (driver console en l'attendant)
- Bundling DSFR local (CSP strict possible une fois fait)
- Playwright e2e (3 parcours : login / tree / conflict)
- Éditeur tree visuel + 17 schémas DSFR (cf. plan §Frontend SPA)

## Documentation

- [`docs/bundle-format.md`](docs/bundle-format.md) — format versionné du
  bundle d'import projet (v1, encore valide en v2)
- [`docs/bundle-schema.json`](docs/bundle-schema.json) — JSON Schema
- [`docs/bundle-example.json`](docs/bundle-example.json) — exemple importable
- [`docs/prompt-cadrage.md`](docs/prompt-cadrage.md) — prompt système Claude.ai
  pour cadrer un nouveau projet
- [`docs/ops/sqlite.md`](docs/ops/sqlite.md) — caveats prod SQLite
- [`docs/ops/restore.md`](docs/ops/restore.md) — procédure de restore
- [`docs/ops/v2-cutover.md`](docs/ops/v2-cutover.md) — bascule v1 → v2
