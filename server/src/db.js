import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || resolve(__dirname, '../../data/app.db');
const SEED_TREE_PATH = process.env.SEED_TREE_PATH ||
  resolve(__dirname, '../../assets/data/tree.json');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migration = readFileSync(resolve(__dirname, 'migrations/001_init.sql'), 'utf-8');
db.exec(migration);

// Seed: ensure a "Système" user exists and an initial revision is present.
function seed() {
  const sysUser = db.prepare('SELECT id FROM users WHERE name = ?').get('Système');
  let sysId;
  if (sysUser) {
    sysId = sysUser.id;
  } else {
    const info = db.prepare('INSERT INTO users (name) VALUES (?)').run('Système');
    sysId = info.lastInsertRowid;
  }

  const head = db.prepare('SELECT id FROM revisions ORDER BY id DESC LIMIT 1').get();
  if (head) return;

  let seedTree;
  try {
    seedTree = JSON.parse(readFileSync(SEED_TREE_PATH, 'utf-8'));
  } catch {
    seedTree = { id: 'root', label: 'Racine', type: 'hub', tldr: '', children: [] };
  }
  db.prepare(`
    INSERT INTO revisions (parent_id, tree_json, author_id, message)
    VALUES (NULL, ?, ?, ?)
  `).run(JSON.stringify(seedTree), sysId, 'Initialisation depuis tree.json');
}

seed();

export function getHeadRevision() {
  return db.prepare(`
    SELECT r.id, r.parent_id, r.tree_json, r.message, r.created_at, r.reverts_id,
           u.name AS author_name, u.id AS author_id
    FROM revisions r
    JOIN users u ON u.id = r.author_id
    ORDER BY r.id DESC LIMIT 1
  `).get();
}
