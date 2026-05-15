// Vocabulaires partagés (publics, échéances, types de page).
//
// Lus depuis la clé `vocab` du projet (project_data.vocab côté serveur),
// matérialisés ici en exports ESM avec live bindings : les pages importent
// `TYPES`, `AUDIENCES`, `DEADLINES`, `DEADLINE_ORDER` et lisent toujours la
// dernière valeur appliquée.
//
// Workflow :
//   1. La page importe les exports + `loadVocab` :
//        import { loadVocab, TYPES, AUDIENCES } from './vocab.js';
//   2. Au boot, la page attend loadVocab() AVANT son premier render.
//   3. loadVocab() fetch /api/projects/:slug/data/vocab, applique le résultat,
//      et met à jour les bindings en place (live).
//   4. Si fetch échoue ou pas de slug courant, on retombe sur LEGACY_VOCAB
//      (configuration d'origine — 9 publics, 4 échéances 2026-2027, 10 types).
//
// Édition : la page « Modèle de données » appelle `saveVocab(config)` pour
// persister, puis applyVocab(config) pour propager localement.

import { collab } from './collab.js';
import { getProjectSlug } from './project.js';

// ---- Defaults ------------------------------------------------------------

// Mirror du LEGACY_VOCAB serveur (db.js). Sert de fallback côté front si
// l'API échoue ou si la clé `vocab` n'a pas encore été initialisée.
export const LEGACY_VOCAB = {
  audiences: [
    { key: 'particuliers',   label: 'Particuliers'  },
    { key: 'coproprietes',   label: 'Copropriétés'  },
    { key: 'collectivites',  label: 'Collectivités' },
    { key: 'pros',           label: 'Pros'          },
    { key: 'industriels',    label: 'Industriels'   },
    { key: 'agriculteurs',   label: 'Agriculteurs'  },
    { key: 'partenaires',    label: 'Partenaires'   },
    { key: 'agents',         label: 'Agents publics'},
    { key: 'outremer',       label: 'Outre-mer'     },
  ],
  deadlines: [
    { key: 'juin',      label: 'Juin 2026'      },
    { key: 'septembre', label: 'Septembre 2026' },
    { key: 'decembre',  label: 'Décembre 2026'  },
    { key: 'y2027',     label: '2027+'          },
  ],
  page_types: [
    { key: 'hub',         label: 'Hub'           },
    { key: 'editorial',   label: 'Éditorial'     },
    { key: 'service',     label: 'Service'       },
    { key: 'simulator',   label: 'Simulateur'    },
    { key: 'map',         label: 'Carte'         },
    { key: 'external',    label: 'Renvoi externe'},
    { key: 'marketplace', label: 'Marketplace'   },
    { key: 'kit',         label: 'Kit'           },
    { key: 'form',        label: 'Formulaire'    },
    { key: 'private',     label: 'Espace privé'  },
  ],
};

export const DEFAULT_VOCAB = {
  audiences: [
    { key: 'tous-publics', label: 'Tous publics' },
  ],
  deadlines: [
    { key: 'court-terme',  label: 'Court terme'  },
    { key: 'moyen-terme',  label: 'Moyen terme'  },
    { key: 'long-terme',   label: 'Long terme'   },
  ],
  page_types: [
    { key: 'hub',         label: 'Hub'        },
    { key: 'editorial',   label: 'Éditorial'  },
    { key: 'service',     label: 'Service'    },
  ],
};

// ---- Live bindings (mutated by applyVocab) -------------------------------

// Initialisés sur LEGACY_VOCAB pour que tout code qui importerait avant
// loadVocab() reste fonctionnel sur les valeurs historiques.
export let TYPES = listToTypes(LEGACY_VOCAB.page_types);
export let AUDIENCES = listToLabelMap(LEGACY_VOCAB.audiences);
export let DEADLINES = listToLabelMap(LEGACY_VOCAB.deadlines);
export let DEADLINE_ORDER = LEGACY_VOCAB.deadlines.map(d => d.key);

// Configuration brute (tableaux de { key, label }) — utile pour la page
// d'édition (Modèle de données) qui veut rendre les listes ordonnées.
export let VOCAB = LEGACY_VOCAB;

// ---- Conversions ---------------------------------------------------------

// Le code historique attendait :
//   TYPES     : { hub: { label: 'Hub' }, ... }
//   AUDIENCES : { particuliers: 'Particuliers', ... }
//   DEADLINES : { juin: 'Juin 2026', ... }
function listToTypes(list) {
  const out = {};
  for (const t of list || []) out[t.key] = { label: t.label };
  return out;
}

function listToLabelMap(list) {
  const out = {};
  for (const t of list || []) out[t.key] = t.label;
  return out;
}

// ---- Apply / Load --------------------------------------------------------

// Mute les bindings exportés à partir d'une config { audiences, deadlines,
// page_types }. Tolère les clés absentes (fallback LEGACY pour la dimension
// concernée) — utile si l'utilisateur a effacé une section par erreur.
export function applyVocab(config) {
  const safe = (config && typeof config === 'object') ? config : {};
  const audiences  = Array.isArray(safe.audiences)  && safe.audiences.length  ? safe.audiences  : LEGACY_VOCAB.audiences;
  const deadlines  = Array.isArray(safe.deadlines)  && safe.deadlines.length  ? safe.deadlines  : LEGACY_VOCAB.deadlines;
  const page_types = Array.isArray(safe.page_types) && safe.page_types.length ? safe.page_types : LEGACY_VOCAB.page_types;

  TYPES          = listToTypes(page_types);
  AUDIENCES      = listToLabelMap(audiences);
  DEADLINES      = listToLabelMap(deadlines);
  DEADLINE_ORDER = deadlines.map(d => d.key);
  VOCAB          = { audiences, deadlines, page_types };
}

let loadPromise = null;

// À appeler une fois au boot d'une page, avant le premier render. Idempotent
// dans la durée de vie du module : la même promesse est partagée entre tous
// les appelants. Si pas de projet courant (page picker), on n'appelle pas
// l'API et on reste sur LEGACY_VOCAB.
export function loadVocab() {
  if (loadPromise) return loadPromise;
  if (!getProjectSlug()) {
    loadPromise = Promise.resolve(VOCAB);
    return loadPromise;
  }
  loadPromise = collab.fetchData('vocab')
    .then(({ data }) => { applyVocab(data); return VOCAB; })
    .catch((e) => {
      console.warn('[vocab] fetch failed, falling back to LEGACY_VOCAB:', e.message);
      return VOCAB;
    });
  return loadPromise;
}

// ---- Edition helpers (used by the « Modèle de données » page) ------------

// Slug ASCII compatible avec les keys historiques.
//   « Locataires »                → "locataires"
//   « Particuliers (résidences) » → "particuliers-residences"
export function slugify(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Génère une key unique à partir d'un label, en évitant les collisions avec
// `taken` (Set ou Array de keys déjà prises).
export function uniqueKey(label, taken) {
  const set = (taken instanceof Set) ? taken : new Set(taken || []);
  let base = slugify(label);
  if (!base) base = 'item';
  if (!set.has(base)) return base;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  throw new Error('Impossible de générer une key unique');
}

// Persiste la config et applique localement. Appelé depuis la page d'édition.
export async function saveVocab(config) {
  await collab.saveData('vocab', config);
  // Reset du cache : un prochain loadVocab() ré-applique (au cas où on
  // rouvre la page sans recharger).
  applyVocab(config);
  loadPromise = Promise.resolve(VOCAB);
  return VOCAB;
}
