import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface SessionRow {
  readonly token: string;
  readonly user_id: number;
  readonly user_name: string;
}

export async function findSessionByToken(k: Kdb, token: string): Promise<SessionRow | undefined> {
  const row = await k
    .selectFrom('sessions as s')
    .innerJoin('users as u', 'u.id', 's.user_id')
    .select(['s.token', 's.user_id', 'u.name as user_name'])
    .where('s.token', '=', token)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function touchSession(k: Kdb, token: string): Promise<void> {
  await k
    .updateTable('sessions')
    .set({ last_seen_at: sql`datetime('now')` })
    .where('token', '=', token)
    .execute();
}

export async function createSession(k: Kdb, token: string, userId: number): Promise<void> {
  await k.insertInto('sessions').values({ token, user_id: userId }).execute();
}

export async function deleteSession(k: Kdb, token: string): Promise<void> {
  await k.deleteFrom('sessions').where('token', '=', token).execute();
}
