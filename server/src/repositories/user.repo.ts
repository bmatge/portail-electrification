import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';
import type { UserRow } from '../db/types.js';

export async function findUserByName(k: Kdb, name: string): Promise<UserRow | undefined> {
  const row = await k
    .selectFrom('users')
    .select(['id', 'name'])
    .where('name', '=', name)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function upsertUserByName(k: Kdb, name: string): Promise<UserRow> {
  return await k
    .insertInto('users')
    .values({ name })
    .onConflict((oc) => oc.column('name').doUpdateSet({ name: sql`excluded.name` }))
    .returning(['id', 'name'])
    .executeTakeFirstOrThrow();
}

export async function ensureSystemUser(k: Kdb): Promise<UserRow> {
  const existing = await findUserByName(k, 'Système');
  if (existing) return existing;
  return upsertUserByName(k, 'Système');
}
