# Format du bundle d'import projet

> **À qui ça s'adresse** : chefs de projet qui veulent amorcer un nouveau projet dans L'atelier 🪢 à partir d'un fichier JSON (export d'un autre projet, ou JSON généré par une IA via [prompt-cadrage.md](prompt-cadrage.md)). Et développeurs qui veulent comprendre ce que produit `GET /api/projects/{slug}/export` et ce qu'accepte `POST /api/projects/import`.
>
> **Source de vérité du code** : [`server/src/db.js`](../server/src/db.js) — fonctions `exportProjectBundle()` et `importProjectFromBundle()`. Si ce document diverge du code, c'est le code qui gagne.

## Vue d'ensemble

Un bundle est un objet JSON unique qui contient **tout l'état courant d'un projet** : métadonnées, arborescence des pages, roadmap fonctionnelle, et catalogues (dispositifs, mesures, objectifs, structure Drupal). Pas d'historique des révisions, pas de commentaires.

```json
{
  "version": 1,
  "exported_at": "2026-05-16T10:30:00.000Z",
  "project": { "slug": "…", "name": "…", "description": "…" },
  "tree": { … },
  "roadmap": { "meta": {…}, "items": [ … ] },
  "data": {
    "dispositifs":      { "meta": {…}, "dispositifs": [ … ] },
    "mesures":          { "meta": {…}, "mesures":     [ … ] },
    "objectifs":        { "meta": {…}, "axes":        [ … ] },
    "drupal_structure": { "content_types": [], "paragraphs": [], "paragraph_labels": {}, "taxonomies": [] }
  }
}
```

Les clés `data.*` manquantes sont remplacées par un défaut à l'import (catalogues vides + `drupal_structure` par défaut). Le `tree` manquant est remplacé par une racine `{ id: 'root', label: name, type: 'hub', children: [] }`.

## Contraintes globales

- `project.slug` : `^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$`, max 50 chars. Si le slug est déjà pris en base, l'import suffixe automatiquement `-2`, `-3`… (jamais destructif).
- `project.name` : max 100 chars.
- `project.description` : max 500 chars.
- `version` : entier, vaut `1` aujourd'hui.
- `exported_at` : ISO 8601, informatif (non rejoué).
- Aucune limite stricte de taille au-delà de ces champs, mais rester raisonnable (l'historique est rejoué dans une transaction SQLite).

## 1. `tree` — Arborescence des pages

Arbre récursif où chaque nœud représente une page (ou un regroupement) du futur site. La racine est obligatoirement `id: "root"`, type `hub`.

### Champs d'un nœud

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | string | oui | Unique dans l'arbre. Convention : `root` pour la racine, sinon préfixe court (`p1`, `b2`, `c1`…) ou hex aléatoire (`nA1B2C`). |
| `label` | string | oui | Nom de la page tel qu'il s'affichera. |
| `types` | string[] | recommandé | Liste de types parmi l'enum **TYPES** ci-dessous. Si absent, le front retombe sur le champ legacy `type`. |
| `type` | string | legacy | Champ historique (un seul type). À éviter en écriture, conservé en lecture pour rétrocompatibilité. |
| `tldr` | string | non | Résumé d'une phrase, affiché en aperçu. |
| `format` | string | non | Format éditorial libre (ex. `"Pages éditoriales et redirections"`). |
| `url` | string | non | Lien externe si le nœud renvoie vers un autre site. |
| `deadline` | string | non | Échéance parmi l'enum **DEADLINES**. |
| `time_tech` | number\|null | non | Estimation tech (heures). |
| `time_edito` | number\|null | non | Estimation édito (heures). |
| `auth` | boolean | non | Page derrière authentification. |
| `audiences` | string[] | non | Liste de codes parmi l'enum **AUDIENCES**. |
| `dispositifs` | string[] | non | IDs de dispositifs liés (doivent exister dans `data.dispositifs.dispositifs`). |
| `mesures` | string[] | non | IDs de mesures liées (doivent exister dans `data.mesures.mesures`). |
| `blocks` | object[] | non | Blocs éditoriaux : `{ id, title, description }`. |
| `improvements` | object[] | non | Améliorations prévues : `{ id, deadline, title, description }`. |
| `children` | node[] | recommandé | Sous-nœuds (récursif). Tableau vide accepté. |

### Enums

**TYPES** — types de page :
`hub`, `editorial`, `service`, `simulator`, `map`, `external`, `marketplace`, `kit`, `form`, `private`.

**DEADLINES** — échéances (calées sur le calendrier 2026 par défaut, libres à adapter par projet via `roadmap.meta.calendrier`) :
`juin`, `septembre`, `decembre`, `y2027`.

**AUDIENCES** — publics cibles :
`particuliers`, `coproprietes`, `collectivites`, `pros`, `industriels`, `agriculteurs`, `partenaires`, `agents`, `outremer`.

> Les enums sont définis dans [`assets/script.js`](../assets/script.js) (lignes ~8-40). L'app affiche les libellés FR ; les codes ci-dessus sont ce qui doit être stocké dans le JSON.

### Champs legacy à éviter

- `type` (singulier) → utiliser `types: ["hub"]`.
- `mesure_plan` → utiliser `mesures: [...]`.
- `audience` (singulier) → utiliser `audiences: [...]`.

Ces alias sont tolérés en lecture mais ne doivent pas apparaître dans un bundle produit aujourd'hui.

## 2. `roadmap` — Stories fonctionnelles

Une roadmap = un calendrier (slices = jalons temporels), une typologie d'actions (verbes utilisateurs), et N items rattachés à un slice + une action + des nœuds + des dispositifs.

### `roadmap.meta`

| Champ | Type | Description |
|---|---|---|
| `title` | string | Titre affiché. |
| `subtitle` | string | Sous-titre. |
| `calendrier` | object[] | Jalons. Chaque entrée : `{ id, label, echeance }`. Les `id` sont utilisés par `items[].slice`. |
| `actions` | object[] | Verbes utilisateurs. Chaque entrée : `{ id, label, desc }`. Les `id` sont utilisés par `items[].action`. |

Sur le projet d'origine, `calendrier` vaut `mvp / v1 / v2 / v3` et `actions` vaut `informer / evaluer / agir`. Ces valeurs sont **libres** : un nouveau projet peut définir les siennes (ex. `phase-1 / phase-2`, `decouvrir / faire`).

### `roadmap.items[]`

| Champ | Type | Description |
|---|---|---|
| `id` | string | Unique (convention `rm-001`, `rm-002`…). |
| `slice` | string | Réfère à un `meta.calendrier[].id`. |
| `action` | string | Réfère à un `meta.actions[].id`. |
| `story` | string | User story (texte libre, généralement à la 1ʳᵉ personne). |
| `status` | string | Statut. Valeur usuelle : `"pending"`. Champ extensible (`done`, `wip`…) mais aucun statut spécifique n'est imposé. |
| `notes` | string | Commentaires libres. |
| `nodes` | string[] | IDs de nœuds du `tree` concernés par cette story. |
| `dispositifs` | string[] | IDs de dispositifs utiles à cette story. |

## 3. `data.dispositifs` — Ressources & services tiers

Catalogue des outils, plateformes, simulateurs ou services existants susceptibles d'être pointés ou intégrés.

### `meta`

| Champ | Type | Description |
|---|---|---|
| `title` | string | Titre du catalogue. |
| `context` | string | Contexte du recensement. |
| `date` | string | Date de mise à jour (ISO ou texte). |
| `version` | number | Version du catalogue. |
| `categories` | string[] | Catégories utilisées pour grouper (ex. `["Logement", "Mobilités", …]`). |
| `note_methodologique` | string | Note libre sur la méthode et le périmètre. |

### `dispositifs[]`

| Champ | Type | Description |
|---|---|---|
| `id` | string | Unique. Convention : `D-{CODE}` (ex. `D-L01`, `D-M07`). |
| `category` | string | Doit appartenir à `meta.categories`. |
| `audience` | string | Public principal (texte libre, ex. `"Particuliers"`, `"Pros"`). |
| `name` | string | Nom du dispositif. |
| `url` | string | Lien (optionnel). |
| `tel` | string | Téléphone (optionnel). |
| `description` | string | Description longue. |
| `porteur` | string | Opérateur(s) (ex. `"ANAH + ADEME"`). |
| `tutelle` | string | Code de la tutelle ministérielle (ex. `"MTE"`). |
| `type` | string | Nature du dispositif (ex. `"Portail orienté service"`, `"Simulateur"`, `"Prime CEE"`). |
| `reutilisable` | string | Texte libre indiquant si réintégrable / liens privilégiés. |
| `maturite` | string | `"Mature"`, `"Récent"`, etc. — texte libre. |
| `commentaire` | string | Commentaire libre (optionnel). |

## 4. `data.mesures` — Politiques publiques rattachées

Catalogue des mesures (actions de politique publique) que le portail communique. Réfèrent à des axes / objectifs propres au projet.

### `meta`

| Champ | Type | Description |
|---|---|---|
| `title` | string | Titre du catalogue. |
| `source` | string | Source (ex. dossier de presse, plan). |
| `axes` | object[] | `{ id, label }`. |
| `objectifs` | object | Map `{ [axeId]: [{ id, label }, …] }`. Tableau vide si l'axe n'a pas d'objectifs. |

### `mesures[]`

| Champ | Type | Description |
|---|---|---|
| `id` | string | Unique (ex. `M1`, `M22`). |
| `axe` | string | Réfère à `meta.axes[].id`. |
| `objectif` | string\|null | Réfère à `meta.objectifs[axe][].id`, ou `null` pour une mesure rattachée à l'axe sans objectif spécifique. |
| `title` | string | Titre court. |
| `summary` | string | Résumé une ligne. |
| `description` | string | Description longue. |
| `qui` | string | Cible / bénéficiaires. |
| `quand` | string | Calendrier en texte libre. |
| `objectif_chiffre` | string | Objectif quantifié (texte libre). |
| `audiences` | string[] | Codes parmi l'enum **AUDIENCES** (cf. tree). |
| `deadline` | string | Code parmi l'enum **DEADLINES**. |

## 5. `data.objectifs` — Pyramide stratégique

Trois niveaux : **axes** (orientation) → **objectives** (résultats visés) → **means** (moyens concrets, rattachables à des nœuds et dispositifs).

> ⚠️ **Format imbriqué** (source de vérité, écrite par le front [`assets/objectifs.js`](../assets/objectifs.js)). À ne pas confondre avec le fallback `{ axes: [], objectifs: [], moyens: [] }` à plat dans [`server/src/db.js`](../server/src/db.js) qui est une coquille (defaults qui ne reflètent pas le vrai format).

### `meta`

| Champ | Type | Description |
|---|---|---|
| `title` | string | Titre. |
| `promise` | string | Promesse globale du site (slogan / proposition de valeur). |
| `subtitle` | string | Sous-titre. |
| `note` | string | Note sur le périmètre (ex. "moyens hors prototype exclus"). |
| `calendrier` | object[] | `{ id, label, echeance }` — généralement le même que `roadmap.meta.calendrier`. |

### `axes[]`

| Champ | Type | Description |
|---|---|---|
| `id` | string | Unique (ex. `A1`, `A5`). |
| `name` | string | Nom de l'axe stratégique. |
| `description` | string | Description longue. |
| `objectives` | object[] | Objectifs rattachés. |

### `axes[].objectives[]`

| Champ | Type | Description |
|---|---|---|
| `id` | string | Hiérarchique (ex. `A1.O1`, `A1.O2`). |
| `name` | string | Nom de l'objectif. |
| `means` | object[] | Moyens concrets. |

### `axes[].objectives[].means[]`

| Champ | Type | Description |
|---|---|---|
| `id` | string | Hiérarchique (ex. `A1.O1.M1`). |
| `text` | string | Description du moyen, une phrase. |
| `nodes` | string[] | IDs de nœuds du `tree` qui portent ce moyen. |
| `dispositifs` | string[] | IDs de dispositifs mobilisés. |

## 6. `data.drupal_structure` — Vocabulaires & schémas éditoriaux

Décrit comment le futur site sera modélisé dans Drupal : types de contenu, paragraphes DSFR activés, taxonomies.

| Champ | Type | Description |
|---|---|---|
| `content_types` | string[] | Types de contenu Drupal (ex. `"Accueil"`, `"Rubrique"`, `"Article"`…). |
| `paragraphs` | string[] | Codes des paragraphes DSFR activés. Liste fermée définie côté front (cf. ci-dessous). |
| `paragraph_labels` | object | Libellés personnalisés `{ [paragraphCode]: "Libellé custom" }`. Optionnel. |
| `taxonomies` | object[] | `{ key, label, multi: boolean, options: string[] }`. |

### Codes de paragraphes valides

`accordion`, `tabs`, `cards-row`, `tiles-row`, `auto-list`, `summary`, `button`, `highlight`, `callout`, `image-text`, `quote`, `table`, `video`, `download-block`, `download-links`, `cards-download`, `code`.

Le schéma de champs de chaque paragraphe est hardcodé dans [`assets/maquette.js`](../assets/maquette.js) et n'est pas exporté.

### Défaut

Si `drupal_structure` est absent du bundle, l'import applique `DEFAULT_DRUPAL_STRUCTURE` ([`server/src/db.js:45`](../server/src/db.js#L45)) : 6 types de contenu, 17 paragraphes tous activés, et 3 taxonomies (`univers`, `cibles`, `mesures` M1..M22).

## Références croisées (intégrité référentielle)

Aucune contrainte FK SQL : les références sont des chaînes de caractères, non vérifiées à l'import. Mais pour un bundle cohérent :

- `tree.…children[].dispositifs[*]` doit pointer vers un `data.dispositifs.dispositifs[*].id` existant.
- `tree.…children[].mesures[*]` doit pointer vers un `data.mesures.mesures[*].id` existant.
- `roadmap.items[*].nodes[*]` doit pointer vers un `tree.…id` existant.
- `roadmap.items[*].dispositifs[*]` doit pointer vers un dispositif existant.
- `data.objectifs.axes[*].objectives[*].means[*].nodes[*]` doit pointer vers un nœud du `tree`.
- `data.mesures.mesures[*].axe` doit appartenir à `data.mesures.meta.axes[*].id`.
- `data.mesures.mesures[*].objectif` doit appartenir à `data.mesures.meta.objectifs[axe][*].id` (ou être `null`).
- `data.dispositifs.dispositifs[*].category` doit appartenir à `data.dispositifs.meta.categories[*]`.

Un bundle qui viole une de ces règles s'importe quand même, mais des liens apparaîtront comme "manquants" dans l'UI (libellés cassés, compteurs faux).

## Exemple

Voir [`bundle-example.json`](bundle-example.json) — mini-projet "Portail Aidants" complet, importable tel quel.

## Schéma JSON formel

Voir [`bundle-schema.json`](bundle-schema.json) — JSON Schema draft 2020-12, validable par n'importe quel validateur standard (ajv, jsonschema…).

## Générer un bundle via une IA

Voir [`prompt-cadrage.md`](prompt-cadrage.md) — prompt système prêt à coller dans Claude.ai (ou autre) qui conduit un chef de projet par questions successives et produit un bundle conforme.
