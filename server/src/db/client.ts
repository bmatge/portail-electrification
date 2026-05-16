// Création du handle SQLite + wrapper Kysely typé.
// - `Db` = handle raw better-sqlite3 (utile pour migrations SQL versionnées
//   et pour les PRAGMA boot)
// - `Kdb` = Kysely<Database> async, source unique des queries applicatives

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DbSchema } from './schema.js';

export type Db = DatabaseType;
export type Kdb = Kysely<DbSchema>;

export interface CreateDatabaseOptions {
  readonly path: string;
  readonly readonly?: boolean;
}

export interface DbHandles {
  readonly raw: Db;
  readonly k: Kdb;
}

export function createDatabase(options: CreateDatabaseOptions): DbHandles {
  if (options.path !== ':memory:') {
    mkdirSync(dirname(options.path), { recursive: true });
  }
  const raw = new Database(options.path, { readonly: options.readonly ?? false });
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  const k = new Kysely<DbSchema>({
    dialect: new SqliteDialect({ database: raw }),
  });
  return { raw, k };
}
