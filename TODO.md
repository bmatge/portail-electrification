# Reste à faire

État au commit `7a894d5` — *Generalise the tool into a multi-project workspace*, complété par la **Phase 2** ci-dessous (page Structure Drupal).

L'outil est désormais multi-projet : `/` = sélecteur, chaque projet vit sous `/p/{slug}/...` avec ses propres tree, roadmap, comments, ressources, politiques publiques **et vocabulaires Drupal**. Le portail d'électrification existant a été migré sans perte sous `/p/portail-electrification/`.

---

## Phase 2 — Page « Structure Drupal » par projet ✅

Terminée. Récap :

- [x] Page [structure-drupal.html](structure-drupal.html) + [assets/structure-drupal.js](assets/structure-drupal.js) (3 sections éditables : types de contenu, paragraphes activés, taxonomies).
- [x] Lib de référence partagée [assets/drupal-vocab.js](assets/drupal-vocab.js) (`PARAGRAPH_LIB`, `DEFAULT_DRUPAL_TYPES`, `DEFAULT_TAXONOMIES`, `resolveVocab()`).
- [x] Persistance via `PUT /api/projects/:slug/data/drupal_structure` (déjà prêt dans `KEYS`).
- [x] Seed par défaut à la création d'un projet (`DEFAULT_DRUPAL_STRUCTURE` exporté depuis [server/src/db.js](server/src/db.js), appliqué par `createProject()` **et** rétro-actif sur le projet `id=1`).
- [x] Refonte de [assets/maquette.js](assets/maquette.js) : `DRUPAL_TYPES`, `PARAGRAPHS`, `TAXO` deviennent des `let` résolus au boot via `resolveVocab()` à partir de la config persistée — fallback automatique sur les défauts si la config est absente. **`PARAGRAPH_SCHEMAS` reste hardcodé** (forme des champs).
- [x] Smoke test : seed initial, création d'un nouveau projet, PUT + GET de structure custom validés (port 4321, DB éphémère).

Modèle de données effectif (clé `drupal_structure`) :

```json
{
  "content_types": ["Accueil", "Rubrique", "Article", "Page neutre", "Webform", "Hors SFD"],
  "paragraphs":    ["accordion", "tabs", "cards-row", "..."],
  "paragraph_labels": { "accordion": "Mon libellé personnalisé" },
  "taxonomies": [
    { "key": "univers", "label": "Type éditorial", "multi": false, "options": ["..."] }
  ]
}
```

---

## Phase 3 — Export / Import ✅

Terminée le 2026-05-15. Récap :

- [x] **Import maquette** : bouton « Importer une maquette » sur la page Maquette (à côté de Exporter). Lit un JSON produit par `subtreeMaquetteData()`, fusionne par `id` dans le tree courant (n'écrase que `drupal_type`, `paragraphs`, `taxonomy`). Stats affichées avant confirmation, ids inconnus comptés et ignorés.
- [x] **Export projet** : `GET /api/projects/:slug/export` → bundle JSON autosuffisant `{ version, project, tree, roadmap, data: {dispositifs, mesures, objectifs, drupal_structure} }`. Pas d'historique des révisions ni de commentaires. Bouton « Exporter » sur chaque carte du picker.
- [x] **Import projet** : `POST /api/projects/import` avec `{ bundle, slug? }`. Toujours non-destructif — crée un nouveau projet. En cas de collision de slug, ajoute un suffixe `-2`, `-3`… Section dédiée dans le picker.
- [x] Smoke test : export 110 Ko, double import → `portail-electrification-2` puis `-3`, roundtrip export→import→ré-export bit-exact (tree 42 children, roadmap 44 items, dispositifs 45, drupal_structure 17 paragraphes).

---

## Plus tard — utile mais non bloquant

### Gestion des projets
- [ ] **Renommer un projet** (label `name` et `description` ; le slug reste figé pour ne pas casser les URLs).
- [ ] **Supprimer un projet** — endpoint `DELETE /api/projects/:slug` + UI dans le picker. Bien penser à `ON DELETE CASCADE` (déjà en place pour `project_data` ; à vérifier que les autres tables n'ont pas de FK qui bloqueraient).
- [ ] **Dupliquer un projet** comme template — possible aujourd'hui via export→import. Pourrait être raccourci en un bouton « Dupliquer » sur la carte du picker (côté serveur : `exportProjectBundle` + `importProjectFromBundle` enchaînés).

### Ergonomie multi-projet
- [ ] Préfixer les clés `localStorage` par le slug pour ne pas mélanger entre projets l'état déplié de l'arborescence, etc. Le helper [`projectStorageKey()`](assets/project.js) existe déjà mais n'est utilisé nulle part — à appliquer dans [`script.js`](assets/script.js#L5) (`COLLAPSED_KEY`) et dans toute autre clé `localStorage` qui resterait.
- [ ] Redirection des anciennes URLs (`/arborescence.html`, etc.) vers le picker, plutôt que de servir la page sans contexte projet (qui plantera silencieusement côté JS).

### Sécurité / collaboration
- [ ] Pas de contrôle d'accès par projet : tout utilisateur identifié peut écrire dans n'importe quel projet. Acceptable pour un outil interne, à revoir si exposé plus largement.
- [ ] L'identification reste un simple « pseudo en cookie » (cf. [auth.js](server/src/auth.js)) — suffisant pour de la traçabilité, pas pour de la sécurité. À reconsidérer si déploiement public.

### Renames / cleanup branding
- [ ] Le nom du repo, le tagline du header, les liens GitHub dans [layout.js](assets/layout.js) et le footer pointent encore vers `portail-electrification`. À renommer si l'outil devient générique pour de bon.
- [ ] Les fichiers `assets/data/*.json` (dispositifs, mesures, objectifs, tree, roadmap) ne sont plus chargés par le frontend — uniquement par [`db.js`](server/src/db.js) au seed initial du projet 1. Une fois la migration acquise sur tous les environnements, ils pourraient être supprimés (ou déplacés sous `server/seed/`).
- [ ] Plusieurs fichiers (CSS notamment, [style.css](assets/style.css)) contiennent encore des classes/sélecteurs nommés autour des concepts d'origine (`portail-electrification`, etc.). Cosmétique.

### Qualité
- [ ] Aucun test automatisé dans le repo. Au minimum un smoke test des routes API (création projet, scope par slug, refus cross-projet) serait sain avant de pousser plus loin.
- [ ] Plan de sauvegarde DB : actuellement la base SQLite vit dans `data/app.db`. Pas de stratégie de backup formalisée.

---

## Décisions prises (rappel)

| Décision | Choix retenu |
|---|---|
| Routage URL | `/p/{slug}/...` |
| Migration portail-élec | Importé tel quel comme projet `id=1`, slug `portail-electrification` |
| `PARAGRAPH_SCHEMAS` | Hardcodé dans [maquette.js](assets/maquette.js) (composants DSFR stables) |
| Vocabulaires (types, paragraphes activés, taxonomies) | Éditables par projet via la future page Structure Drupal |
| Page arbre de décision | Supprimée |
| « Dispositifs » → | « Ressources & services » (URL inchangée : `/dispositifs`) |
| « Mesures du plan » → | « Politiques publiques » (URL inchangée : `/mesures`) |

---

## Points d'attention pour la reprise

- **Avant de toucher quoi que ce soit en prod**, vérifier que le serveur démarre proprement avec la base existante et que les pages du portail-élec se rechargent à l'identique sous `/p/portail-electrification/...`. Le smoke test de la session a vérifié ça en local.
- Les anciennes URLs (`/arborescence.html` au lieu de `/p/.../arborescence`) restent servies par `express.static` mais n'ont plus de contexte projet — à éviter et à rediriger plus tard.
- Le bouton « Réinitialiser » des pages dispositifs/mesures vide maintenant le catalogue **du projet courant** (au lieu de réinjecter les défauts statiques). Le wording reste à ajuster si besoin.
