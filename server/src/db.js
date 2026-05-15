import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || resolve(__dirname, '../../data/app.db');
const ASSETS_DATA = resolve(__dirname, '../../assets/data');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- Migrations ----------------------------------------------------------

const MIGRATIONS = ['001_init.sql', '002_roadmap.sql', '003_projects.sql'];
for (const file of MIGRATIONS) {
  db.exec(readFileSync(resolve(__dirname, 'migrations', file), 'utf-8'));
}

// SQLite ne supporte pas IF NOT EXISTS pour ALTER TABLE ; on vérifie la
// présence de la colonne avant l'ajout pour rendre l'opération idempotente.
function ensureProjectIdColumn(table) {
  const cols = db.pragma(`table_info(${table})`);
  if (!cols.some(c => c.name === 'project_id')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_project ON ${table}(project_id)`);
}
for (const t of ['revisions', 'roadmap_revisions', 'comments']) ensureProjectIdColumn(t);

// ---- Seed ----------------------------------------------------------------

function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

// Vocabulaires (audiences, échéances, types de page) éditables par projet.
// Stockés dans la clé `vocab` de project_data. Le frontend lit ce JSON au boot
// et le matérialise dans assets/vocab.js (live ESM bindings). Si la clé est
// absente, le frontend retombe sur LEGACY_VOCAB (= ce qui était hardcodé).
//
// LEGACY_VOCAB = ce qui était hardcodé dans le code historique (plan
// d'électrification : 9 publics, 4 échéances 2026-2027, 10 types de nœud).
// Sert à initialiser **rétroactivement** le projet 1 et tout projet existant
// qui n'aurait pas encore de clé vocab — pour ne casser aucune référence.
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

// Seed minimal neutre pour un nouveau projet : un public générique, 3 horizons
// temporels génériques, 3 types qui matchent l'heuristique seedMaquette
// (hub/editorial/service). L'utilisateur enrichit depuis la page « Modèle de
// données ».
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

// Modèle de données par défaut (cible Drupal/DSFR sous le capot).
// Le schéma de chaque composant reste hardcodé côté front (assets/maquette.js) ;
// ce seed n'expose que ce qui est éditable : la liste des codes activés,
// leurs libellés et les taxonomies.
//
// Les taxonomies sont volontairement minimales : un nouveau projet part avec
// un public générique et aucune politique pré-remplie. Le projet historique
// `portail-electrification` conserve sa config (INSERT OR IGNORE ne réécrit pas).
export const DEFAULT_DRUPAL_STRUCTURE = {
  content_types: ['Accueil', 'Rubrique', 'Article', 'Page neutre', 'Webform', 'Hors SFD'],
  paragraphs: [
    'accordion', 'tabs', 'cards-row', 'tiles-row', 'auto-list', 'summary',
    'button', 'highlight', 'callout', 'image-text', 'quote', 'table',
    'video', 'download-block', 'download-links', 'cards-download', 'code',
  ],
  paragraph_labels: {},
  taxonomies: [
    {
      key: 'univers', label: 'Type éditorial', multi: false,
      options: ['Actualité', 'Page rubrique', 'Fiche pratique', 'Outil ou simulateur'],
    },
    {
      key: 'cibles', label: 'Public', multi: true,
      options: ['Tous publics'],
    },
    {
      key: 'mesures', label: 'Politique publique', multi: true,
      options: [],
    },
  ],
};

function getOrCreateSystemUser() {
  const row = db.prepare('SELECT id FROM users WHERE name = ?').get('Système');
  if (row) return row.id;
  return db.prepare('INSERT INTO users (name) VALUES (?)').run('Système').lastInsertRowid;
}

function seedDefaultProjectContent(projectId, sysUserId) {
  // Tree initial si aucune révision pour ce projet
  const treeHead = db.prepare('SELECT id FROM revisions WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(projectId);
  if (!treeHead) {
    const seed = readJsonOrNull(resolve(ASSETS_DATA, 'tree.json'))
      ?? { id: 'root', label: 'Racine', type: 'hub', tldr: '', children: [] };
    db.prepare(`
      INSERT INTO revisions (project_id, parent_id, tree_json, author_id, message)
      VALUES (?, NULL, ?, ?, ?)
    `).run(projectId, JSON.stringify(seed), sysUserId, 'Initialisation depuis tree.json');
  }

  // Roadmap initiale si aucune révision pour ce projet
  const rmHead = db.prepare('SELECT id FROM roadmap_revisions WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(projectId);
  if (!rmHead) {
    const seed = readJsonOrNull(resolve(ASSETS_DATA, 'roadmap.json')) ?? { meta: {}, items: [] };
    db.prepare(`
      INSERT INTO roadmap_revisions (project_id, parent_id, data_json, author_id, message)
      VALUES (?, NULL, ?, ?, ?)
    `).run(projectId, JSON.stringify(seed), sysUserId, 'Initialisation depuis roadmap.json');
  }

  // Catalogues (project_data)
  const seedKeys = [
    ['dispositifs', resolve(ASSETS_DATA, 'dispositifs.json')],
    ['mesures',     resolve(ASSETS_DATA, 'mesures.json')],
    ['objectifs',   resolve(ASSETS_DATA, 'objectifs.json')],
  ];
  const insertData = db.prepare(`
    INSERT OR IGNORE INTO project_data (project_id, key, json_value, updated_by)
    VALUES (?, ?, ?, ?)
  `);
  for (const [key, path] of seedKeys) {
    const data = readJsonOrNull(path);
    if (data == null) continue;
    insertData.run(projectId, key, JSON.stringify(data), sysUserId);
  }
  // Structure Drupal par défaut (rétro-actif pour le projet historique)
  insertData.run(projectId, 'drupal_structure', JSON.stringify(DEFAULT_DRUPAL_STRUCTURE), sysUserId);
  // Vocabulaires : pour le projet historique on injecte LEGACY_VOCAB pour
  // préserver les références existantes (audiences/deadlines/types
  // hardcodées dans le code historique). INSERT OR IGNORE protège la valeur
  // si la clé existe déjà.
  insertData.run(projectId, 'vocab', JSON.stringify(LEGACY_VOCAB), sysUserId);
}

const sysId = getOrCreateSystemUser();
seedDefaultProjectContent(1, sysId);

// ---- Project helpers -----------------------------------------------------

export function getProjectBySlug(slug) {
  return db.prepare('SELECT id, slug, name, description, created_at FROM projects WHERE slug = ? COLLATE NOCASE').get(slug);
}

export function getProjectById(id) {
  return db.prepare('SELECT id, slug, name, description, created_at FROM projects WHERE id = ?').get(id);
}

export function listProjects() {
  return db.prepare(`
    SELECT p.id, p.slug, p.name, p.description, p.created_at,
           (SELECT COUNT(*) FROM revisions WHERE project_id = p.id) AS revision_count
    FROM projects p
    ORDER BY p.created_at ASC
  `).all();
}

export function createProject({ slug, name, description = '' }) {
  const info = db.prepare('INSERT INTO projects (slug, name, description) VALUES (?, ?, ?)').run(slug, name, description);
  const projectId = Number(info.lastInsertRowid);
  // Seed minimal vide (root tree + empty roadmap + empty catalogues)
  const sysUserId = getOrCreateSystemUser();
  db.prepare(`
    INSERT INTO revisions (project_id, parent_id, tree_json, author_id, message)
    VALUES (?, NULL, ?, ?, ?)
  `).run(
    projectId,
    JSON.stringify({ id: 'root', label: name, type: 'hub', tldr: '', children: [] }),
    sysUserId,
    'Création du projet',
  );
  db.prepare(`
    INSERT INTO roadmap_revisions (project_id, parent_id, data_json, author_id, message)
    VALUES (?, NULL, ?, ?, ?)
  `).run(projectId, JSON.stringify({ meta: {}, items: [] }), sysUserId, 'Création du projet');
  // Catalogues vides + Structure Drupal par défaut + vocabulaires neutres
  const insertData = db.prepare('INSERT OR IGNORE INTO project_data (project_id, key, json_value, updated_by) VALUES (?, ?, ?, ?)');
  for (const [key, value] of [
    ['dispositifs',      { dispositifs: [] }],
    ['mesures',          { mesures: [] }],
    ['objectifs',        { axes: [], objectives: [], means: [] }],
    ['drupal_structure', DEFAULT_DRUPAL_STRUCTURE],
    ['vocab',            DEFAULT_VOCAB],
  ]) {
    insertData.run(projectId, key, JSON.stringify(value), sysUserId);
  }
  return getProjectById(projectId);
}

// ---- Head revision helpers (project-scoped) ------------------------------

export function getHeadRevision(projectId) {
  return db.prepare(`
    SELECT r.id, r.parent_id, r.tree_json, r.message, r.created_at, r.reverts_id,
           u.name AS author_name, u.id AS author_id
    FROM revisions r
    JOIN users u ON u.id = r.author_id
    WHERE r.project_id = ?
    ORDER BY r.id DESC LIMIT 1
  `).get(projectId);
}

export function getRoadmapHeadRevision(projectId) {
  return db.prepare(`
    SELECT r.id, r.parent_id, r.data_json, r.message, r.created_at, r.reverts_id,
           u.name AS author_name, u.id AS author_id
    FROM roadmap_revisions r
    JOIN users u ON u.id = r.author_id
    WHERE r.project_id = ?
    ORDER BY r.id DESC LIMIT 1
  `).get(projectId);
}

// ---- Suppression d'un projet -------------------------------------------

// Supprime un projet et tout son contenu (révisions tree + roadmap,
// commentaires, catalogues). Les tables historiques `revisions`,
// `roadmap_revisions` et `comments` n'ont pas de FK ON DELETE CASCADE
// (project_id ajouté par ALTER TABLE sans FK), donc on les vide à la main.
// `defer_foreign_keys` reporte la validation des FK auto-référencées
// (parent_id, reverts_id) à la fin de la transaction.
export function deleteProject(projectId) {
  const tx = db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    db.prepare('DELETE FROM comments WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM revisions WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM roadmap_revisions WHERE project_id = ?').run(projectId);
    // project_data : supprimé via ON DELETE CASCADE quand on supprime le projet.
    const info = db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    return info.changes;
  });
  return tx();
}

// ---- Export / Import bundle ---------------------------------------------

const EXPORT_KEYS = ['dispositifs', 'mesures', 'objectifs', 'drupal_structure', 'vocab'];

// Construit un bundle JSON autosuffisant pour un projet : métadonnées + état
// courant (tree head, roadmap head, project_data). N'inclut pas l'historique
// des révisions ni les commentaires (volumineux, peu portables).
export function exportProjectBundle(projectId) {
  const project = getProjectById(projectId);
  if (!project) return null;
  const treeHead = getHeadRevision(projectId);
  const roadmapHead = getRoadmapHeadRevision(projectId);
  const dataRows = db.prepare(
    'SELECT key, json_value FROM project_data WHERE project_id = ?'
  ).all(projectId);
  const data = {};
  for (const r of dataRows) {
    if (EXPORT_KEYS.includes(r.key)) data[r.key] = JSON.parse(r.json_value);
  }
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    project: { slug: project.slug, name: project.name, description: project.description || '' },
    tree: treeHead ? JSON.parse(treeHead.tree_json) : null,
    roadmap: roadmapHead ? JSON.parse(roadmapHead.data_json) : { meta: {}, items: [] },
    data,
  };
}

// Trouve un slug libre à partir d'une base : "foo" → "foo", sinon "foo-2", "foo-3"…
function findFreeSlug(base) {
  if (!getProjectBySlug(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 50);
    if (!getProjectBySlug(candidate)) return candidate;
  }
  throw new Error('Impossible de générer un slug libre');
}

// Crée un nouveau projet à partir d'un bundle exporté. Toujours non-destructif :
// si le slug est déjà pris, on lui ajoute un suffixe -2, -3...
// Tout se passe dans une transaction : si l'insertion d'une partie échoue,
// le projet n'est pas créé.
export function importProjectFromBundle(bundle, sysUserId, { slugOverride } = {}) {
  if (!bundle || typeof bundle !== 'object') throw new Error('bundle_invalid');
  const meta = bundle.project || {};
  const requestedSlug = String(slugOverride || meta.slug || '').trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  if (!requestedSlug || !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(requestedSlug)) {
    throw new Error('bundle_slug_invalid');
  }
  const name = String(meta.name || requestedSlug).trim().slice(0, 100);
  const description = String(meta.description || '').trim().slice(0, 500);
  const tree = (bundle.tree && typeof bundle.tree === 'object' && bundle.tree.id)
    ? bundle.tree
    : { id: 'root', label: name, type: 'hub', tldr: '', children: [] };
  const roadmap = (bundle.roadmap && typeof bundle.roadmap === 'object' && Array.isArray(bundle.roadmap.items))
    ? bundle.roadmap
    : { meta: {}, items: [] };
  const dataBundle = (bundle.data && typeof bundle.data === 'object') ? bundle.data : {};

  const finalSlug = findFreeSlug(requestedSlug);
  const slugWasRenamed = finalSlug !== requestedSlug;

  const tx = db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO projects (slug, name, description) VALUES (?, ?, ?)'
    ).run(finalSlug, name, description);
    const projectId = Number(info.lastInsertRowid);

    db.prepare(`
      INSERT INTO revisions (project_id, parent_id, tree_json, author_id, message)
      VALUES (?, NULL, ?, ?, ?)
    `).run(projectId, JSON.stringify(tree), sysUserId, 'Import du projet');

    db.prepare(`
      INSERT INTO roadmap_revisions (project_id, parent_id, data_json, author_id, message)
      VALUES (?, NULL, ?, ?, ?)
    `).run(projectId, JSON.stringify(roadmap), sysUserId, 'Import du projet');

    const insertData = db.prepare(
      'INSERT OR REPLACE INTO project_data (project_id, key, json_value, updated_by) VALUES (?, ?, ?, ?)'
    );
    // On insère les clés présentes dans le bundle, en complétant avec les
    // défauts pour les clés manquantes (catalogues vides + drupal_structure).
    const fallbacks = {
      dispositifs:      { dispositifs: [] },
      mesures:          { mesures: [] },
      objectifs:        { axes: [], objectives: [], means: [] },
      drupal_structure: DEFAULT_DRUPAL_STRUCTURE,
      vocab:            DEFAULT_VOCAB,
    };
    for (const key of EXPORT_KEYS) {
      const value = (key in dataBundle && dataBundle[key] !== null && typeof dataBundle[key] === 'object')
        ? dataBundle[key] : fallbacks[key];
      insertData.run(projectId, key, JSON.stringify(value), sysUserId);
    }
    return projectId;
  });

  const projectId = tx();
  return { project: getProjectById(projectId), slugWasRenamed, finalSlug };
}
