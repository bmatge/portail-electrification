import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';
import type { UserRow } from '../db/types.js';

export async function findUserByEmail(k: Kdb, email: string): Promise<UserRow | undefined> {
  const row = await k
    .selectFrom('users')
    .select(['id', 'display_name', 'email', 'status'])
    .where(sql<boolean>`email COLLATE NOCASE = ${email}`)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function findUserById(k: Kdb, id: number): Promise<UserRow | undefined> {
  const row = await k
    .selectFrom('users')
    .select(['id', 'display_name', 'email', 'status'])
    .where('id', '=', id)
    .executeTakeFirst();
  return row ?? undefined;
}

// Crée un user actif lié à un email (path self-signup). Si un user existe déjà
// avec ce display_name (legacy v1 sans email), on lui assigne l'email plutôt
// que d'en créer un doublon. Sinon on crée un nouveau user.
export interface CreateUserInput {
  readonly email: string;
  readonly displayName: string;
}

export async function createUserWithEmail(k: Kdb, input: CreateUserInput): Promise<UserRow> {
  return await k
    .insertInto('users')
    .values({
      display_name: input.displayName,
      email: input.email,
      updated_at: sql<string>`datetime('now')`,
    })
    .returning(['id', 'display_name', 'email', 'status'])
    .executeTakeFirstOrThrow();
}

export async function setUserLastLogin(k: Kdb, userId: number): Promise<void> {
  await k
    .updateTable('users')
    .set({
      last_login_at: sql<string>`datetime('now')`,
      updated_at: sql<string>`datetime('now')`,
    })
    .where('id', '=', userId)
    .execute();
}

// Système utilisateur sentinelle : porte les seed automatiques (anciennes
// révisions, imports). Pas d'email, status active.
export async function ensureSystemUser(k: Kdb): Promise<UserRow> {
  const existing = await k
    .selectFrom('users')
    .select(['id', 'display_name', 'email', 'status'])
    .where('display_name', '=', 'Système')
    .executeTakeFirst();
  if (existing) return existing;
  return await k
    .insertInto('users')
    .values({
      display_name: 'Système',
      updated_at: sql<string>`datetime('now')`,
    })
    .returning(['id', 'display_name', 'email', 'status'])
    .executeTakeFirstOrThrow();
}
