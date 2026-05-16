import type { Db } from '../db/client.js';
import type { UserRow } from '../db/types.js';

export function findUserByName(db: Db, name: string): UserRow | undefined {
  return db.prepare('SELECT id, name FROM users WHERE name = ?').get(name) as UserRow | undefined;
}

export function upsertUserByName(db: Db, name: string): UserRow {
  return db
    .prepare(
      `INSERT INTO users (name) VALUES (?)
       ON CONFLICT(name) DO UPDATE SET name = excluded.name
       RETURNING id, name`,
    )
    .get(name) as UserRow;
}

export function ensureSystemUser(db: Db): UserRow {
  const existing = findUserByName(db, 'Système');
  if (existing) return existing;
  return upsertUserByName(db, 'Système');
}
