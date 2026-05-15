# L'atelier 🪢

Outil interne multi-projets pour cartographier l'arborescence, la roadmap, les ressources et les politiques publiques d'un futur site web institutionnel, avant sa construction dans Drupal.

> Code dans GitHub, contexte projet dans le vault Obsidian — fiche projet : `~/Documents/Obsidian/10-Projects/latelier-cadrage-site.md`.

- **Production** : <https://latelier.bercy.matge.com>
- **Démarrage local** : `cd server && npm run dev`
- **Déploiement VPS** : `./deploy.sh [--no-pull] [--logs]`
- **Stack** : Node ≥ 20 (ESM) · Express · SQLite (`better-sqlite3`) · HTML/CSS/JS vanilla · Docker + Traefik.

Pour le détail (architecture, commandes, todo), voir la fiche projet dans le vault.

---

## Documentation du format d'import

Le dossier [`docs/`](docs/) documente le **bundle d'import projet** : le JSON qu'on importe via le picker pour amorcer un nouveau projet (ou qu'on récupère via `GET /api/projects/{slug}/export`).

| Fichier | Rôle | Public |
|---|---|---|
| [`docs/bundle-format.md`](docs/bundle-format.md) | Spec narrative (vue d'ensemble, contraintes, sections, enums, références croisées) | Humains — **source de vérité** |
| [`docs/bundle-example.json`](docs/bundle-example.json) | Mini-projet « Portail Aidants » importable tel quel | Humains + outils — exemple canonique |
| [`docs/bundle-schema.json`](docs/bundle-schema.json) | JSON Schema draft 2020-12 | Outils (validateurs, IDE, génération de typings) |
| [`docs/prompt-cadrage.md`](docs/prompt-cadrage.md) | Prompt système prêt à coller dans Claude.ai (long + variante courte) | Chefs de projet qui veulent générer un bundle via une IA |

### Hiérarchie des sources de vérité

En cas de divergence entre les fichiers ci-dessus :

1. **Le code applicatif gagne toujours.** Sources canoniques :
   - Bundle (export/import) : [`server/src/db.js`](server/src/db.js) — `exportProjectBundle()`, `importProjectFromBundle()`, `DEFAULT_DRUPAL_STRUCTURE`.
   - Enums front (TYPES, DEADLINES, AUDIENCES) : [`assets/script.js`](assets/script.js) (≈ lignes 8-40), répliqués dans [`assets/roadmap.js`](assets/roadmap.js) et [`assets/mesures.js`](assets/mesures.js).
2. **`bundle-format.md`** est la doc humaine canonique. Si elle contredit `bundle-schema.json`, c'est le `.md` qui décrit l'intention.
3. **`bundle-schema.json`** est dérivé de `bundle-format.md` ; c'est lui qu'on utilise pour valider mécaniquement.
4. **`bundle-example.json`** est un test vivant : si on le modifie, il doit toujours valider contre le schema.
5. **`prompt-cadrage.md`** est dérivé du format + des enums ; il **ne sert pas** à découvrir le format, seulement à le faire produire par une IA.

## Faire évoluer le schéma

Quand on change quelque chose dans le bundle (nouveau champ, enum élargi, contrainte modifiée), suivre cet ordre pour éviter les divergences :

1. **Modifier le code** d'abord — `server/src/db.js` et/ou les enums dans `assets/*.js`. Tester en local : créer un projet, exporter, réimporter.
2. **Mettre à jour `docs/bundle-format.md`** — la section concernée, les enums en tête de section, les références croisées si elles bougent. Garder le tableau des champs aligné avec le code.
3. **Mettre à jour `docs/bundle-schema.json`** — répercuter le changement (nouveau `$def`, enum élargi, contrainte). Garder l'ordre des champs cohérent avec le `.md` pour faciliter la relecture.
4. **Mettre à jour `docs/bundle-example.json`** si nécessaire (au moins un nœud doit illustrer le nouveau champ si c'est un ajout). Re-valider l'exemple :

   ```bash
   npx ajv-cli@5 validate -s docs/bundle-schema.json -d docs/bundle-example.json --spec=draft2020
   ```

   Doit afficher `docs/bundle-example.json valid`.

5. **Mettre à jour `docs/prompt-cadrage.md`** — la section « Règles strictes », les enums, la variante courte. Faire l'exercice complet (poser le prompt à une IA et vérifier qu'elle produit un bundle qui passe le validator).

### Quand bumper `version`

Le champ `version` du bundle vaut `1` aujourd'hui. À incrémenter **uniquement** en cas de rupture de rétrocompatibilité — c'est-à-dire si un bundle produit avec l'ancien format ne peut plus s'importer correctement avec le nouveau code (champ renommé, valeur d'enum supprimée, structure réorganisée). Les ajouts purs (nouveau champ optionnel, nouvelle valeur d'enum) restent en `version: 1`.

Si on passe à `version: 2`, prévoir une migration côté `importProjectFromBundle()` pour accepter les anciens bundles (`v1`) et les convertir avant insertion. Documenter la migration dans une ADR (`~/Documents/Obsidian/30-Knowledge/ADR/`).

### Champs legacy

Certains champs du `tree` (`type` singulier, `mesure_plan`, `audience` singulier) sont tolérés en lecture mais ne doivent plus être produits. Si on les supprime un jour de la lecture, c'est un **breaking change** → bump de version + migration.

## Sanity check rapide

Pour valider qu'on n'a rien cassé après une modif du schéma :

```bash
# 1. JSON valides
node -e "JSON.parse(require('fs').readFileSync('docs/bundle-example.json'))"
node -e "JSON.parse(require('fs').readFileSync('docs/bundle-schema.json'))"

# 2. L'exemple respecte le schéma
npx ajv-cli@5 validate -s docs/bundle-schema.json -d docs/bundle-example.json --spec=draft2020

# 3. (Manuel) Importer l'exemple dans une instance locale et vérifier qu'il s'affiche correctement
cd server && npm run dev
# puis ouvrir http://localhost:3000, picker → « Importer un projet », choisir docs/bundle-example.json
```
