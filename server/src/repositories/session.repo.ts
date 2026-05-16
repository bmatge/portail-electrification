// Sessions v2 : id auto-incrémenté + token_hash UNIQUE. On ne stocke jamais
// le token en clair — un vol de DB ne donne pas accès aux sessions actives.

import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface SessionRow {
  readonly id: number;
  readonly user_id: number;
  readonly expires_at: string;
  readonly revoked_at: string | null;
}

export interface SessionWithUser {
  readonly id: number;
  readonly user_id: number;
  readonly user_display_name: string;
  readonly user_email: string | null;
  readonly user_status: 'active' | 'disabled' | 'pending';
  readonly expires_at: string;
  readonly revoked_at: string | null;
}

export async function findActiveSessionByHash(
  k: Kdb,
  tokenHash: string,
): Promise<SessionWithUser | undefined> {
  const row = await k
    .selectFrom('sessions as s')
    .innerJoin('users as u', 'u.id', 's.user_id')
    .select([
      's.id',
      's.user_id',
      's.expires_at',
      's.revoked_at',
      'u.display_name as user_display_name',
      'u.email as user_email',
      'u.status as user_status',
    ])
    .where('s.token_hash', '=', tokenHash)
    .where('s.revoked_at', 'is', null)
    .where('s.expires_at', '>', sql<string>`datetime('now')`)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function touchSession(k: Kdb, id: number): Promise<void> {
  await k
    .updateTable('sessions')
    .set({ last_seen_at: sql<string>`datetime('now')` })
    .where('id', '=', id)
    .execute();
}

export interface CreateSessionInput {
  readonly tokenHash: string;
  readonly userId: number;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly previousId: number | null;
  readonly expiresAt: string;
}

export async function createSession(
  k: Kdb,
  input: CreateSessionInput,
): Promise<{ readonly id: number }> {
  return await k
    .insertInto('sessions')
    .values({
      token_hash: input.tokenHash,
      user_id: input.userId,
      ip: input.ip,
      user_agent: input.userAgent,
      previous_id: input.previousId,
      expires_at: input.expiresAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
}

export async function revokeSession(k: Kdb, id: number): Promise<void> {
  await k
    .updateTable('sessions')
    .set({ revoked_at: sql<string>`datetime('now')` })
    .where('id', '=', id)
    .where('revoked_at', 'is', null)
    .execute();
}

export async function revokeAllSessionsForUser(k: Kdb, userId: number): Promise<void> {
  await k
    .updateTable('sessions')
    .set({ revoked_at: sql<string>`datetime('now')` })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .execute();
}
