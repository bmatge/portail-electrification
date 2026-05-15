# Reste à faire

État au commit `7a894d5` — *Generalise the tool into a multi-project workspace*.

L'outil est désormais multi-projet : `/` = sélecteur, chaque projet vit sous `/p/{slug}/...` avec ses propres tree, roadmap, comments, ressources et politiques publiques. Le portail d'électrification existant a été migré sans perte sous `/p/portail-electrification/`.

---

## Phase 2 — Page « Structure Drupal » par projet (prochaine étape)

C'est la suite immédiate qui était planifiée mais pas démarrée.

- [ ] Créer la page `structure-drupal.html` + `assets/structure-drupal.js`.
- [ ] Ajouter `'structure-drupal'` au set `PAGES` dans [server/src/index.js](server/src/index.js).
- [ ] Persister la config sous la clé `drupal_structure` via le routeur déjà prêt (`PUT /api/projects/:slug/data/drupal_structure`). Le set `KEYS` dans [server/src/routes/data.js](server/src/routes/data.js#L9) accepte déjà cette clé.
- [ ] Modèle de données proposé :
  ```json
  {
    "content_types": ["Accueil", "Rubrique", "Article", "Page neutre", "Webform"],
    "paragraphs":    ["accordion", "tabs", "cards-row", "button", "callout", "..."],
    "taxonomies": [
      { "key": "univers",  "label": "Type éditorial", "multi": false, "options": ["Actualité", "Page rubrique", "..."] },
      { "key": "cibles",   "label": "Public",         "multi": true,  "options": ["Tous publics", "Particuliers", "..."] },
      { "key": "mesures",  "label": "Mesure",         "multi": true,  "options": ["M1", "M2", "..."] }
    ]
  }
  ```
- [ ] UI : trois sections éditables (types de contenu, paragraphes activés depuis la lib hardcodée `PARAGRAPH_SCHEMAS`, taxonomies avec libellé + options). Le **schéma** de chaque paragraphe (forme des champs) reste en dur côté front — seules la liste des paragraphes activés et leurs libellés sont éditables.
- [ ] Refondre [assets/maquette.js](assets/maquette.js) pour lire `DRUPAL_TYPES`, `PARAGRAPHS` (filtré sur ceux activés), et `TAXO` depuis cette config quand elle existe, avec **fallback** sur les constantes hardcodées actuelles si le projet n'a rien défini.
- [ ] Seed par défaut à la création d'un projet : config DSFR standard (mêmes valeurs qu'aujourd'hui).

---

## Plus tard — utile mais non bloquant

### Gestion des projets
- [ ] **Renommer un projet** (label `name` et `description` ; le slug reste figé pour ne pas casser les URLs).
- [ ] **Supprimer un projet** — endpoint `DELETE /api/projects/:slug` + UI dans le picker. Bien penser à `ON DELETE CASCADE` (déjà en place pour `project_data` ; à vérifier que les autres tables n'ont pas de FK qui bloqueraient).
- [ ] **Dupliquer un projet** comme template — utile pour cloner la structure du portail-élec sur un nouveau projet.

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
