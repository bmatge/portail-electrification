// Création du handle SQLite. Singleton à l'échelle du processus pour le
// runtime ; en tests on appelle `createDatabase(':memory:')` par suite via
// les fixtures supertest.

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseType;

export interface CreateDatabaseOptions {
  readonly path: string;
  readonly readonly?: boolean;
}

export function createDatabase({ path, readonly = false }: CreateDatabaseOptions): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path, { readonly });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
