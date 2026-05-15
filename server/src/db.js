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
  // Catalogues vides
  const insertData = db.prepare('INSERT OR IGNORE INTO project_data (project_id, key, json_value, updated_by) VALUES (?, ?, ?, ?)');
  for (const [key, value] of [
    ['dispositifs', { dispositifs: [] }],
    ['mesures',     { mesures: [] }],
    ['objectifs',   { axes: [], objectifs: [], moyens: [] }],
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
