// Mécanisme de migrations versionnées : table `schema_migrations` + fichiers
// SQL ordonnés alphabétiquement. Chaque migration s'applique dans une
// transaction unique ; le numéro de version vit dans le nom du fichier.
//
// Pour les bases existantes (prod v1) qui ont déjà été initialisées sans
// table `schema_migrations`, le migrator applique une **baseline** :
// au premier boot v2, si la table `users` ou `projects` existe déjà, on
// considère les migrations 001/002/003 comme appliquées sans rejouer leur
// SQL — leurs `CREATE IF NOT EXISTS` seraient certes idempotents, mais on
// veut un baseline propre pour distinguer "appliqué v1" vs "appliqué v2".
//
// Le `ensureLegacyColumns()` post-migration est conservé pour ajouter la
// colonne `project_id` aux tables historiques quand elle manque encore
// (cas d'une DB v1 antérieure à la généralisation multi-projets). Cette
// logique passera en migration formelle dans une phase ultérieure.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = resolve(here, 'migrations');

interface ColumnInfoRow {
  readonly name: string;
}

interface MigrationRow {
  readonly name: string;
}

export interface MigratorOptions {
  readonly migrationsDir?: string;
}

export function runMigrations(db: Db, options: MigratorOptions = {}): readonly string[] {
  const dir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT    PRIMARY KEY,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  applyBaselineIfNeeded(db);

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as readonly MigrationRow[]).map(
      (r) => r.name,
    ),
  );

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf-8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    apply();
    newlyApplied.push(file);
  }

  ensureLegacyColumns(db);
  return newlyApplied;
}

function applyBaselineIfNeeded(db: Db): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number })
    .n;
  if (count > 0) return;

  const has = (name: string): boolean =>
    db
      .prepare('SELECT 1 AS one FROM sqlite_master WHERE type = ? AND name = ?')
      .get('table', name) !== undefined;

  const insert = db.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)');
  const baseline = db.transaction(() => {
    if (has('users') && has('revisions') && has('comments')) {
      insert.run('001_init.sql');
    }
    if (has('roadmap_revisions')) {
      insert.run('002_roadmap.sql');
    }
    if (has('projects') && has('project_data')) {
      insert.run('003_projects.sql');
    }
  });
  baseline();
}

// Ajoute la colonne `project_id` aux tables historiques quand elle manque.
// Idempotent : `PRAGMA table_info` détecte la présence de la colonne avant
// l'ALTER. Sera remplacé par une migration formelle quand on ajoutera les
// FK explicites (cf. plan v2, phase ultérieure).
function ensureLegacyColumns(db: Db): void {
  const tables = ['revisions', 'roadmap_revisions', 'comments'] as const;
  for (const table of tables) {
    const cols = db.pragma(`table_info(${table})`) as readonly ColumnInfoRow[];
    if (!cols.some((c) => c.name === 'project_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_project ON ${table}(project_id)`);
  }
}
