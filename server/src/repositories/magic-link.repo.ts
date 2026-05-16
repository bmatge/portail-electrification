import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface InsertMagicLinkInput {
  readonly tokenHash: string;
  readonly email: string;
  readonly userId: number | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly expiresAt: string;
}

export async function insertMagicLink(k: Kdb, input: InsertMagicLinkInput): Promise<void> {
  await k
    .insertInto('magic_link_tokens')
    .values({
      token_hash: input.tokenHash,
      email: input.email,
      user_id: input.userId,
      requested_ip: input.ip,
      user_agent: input.userAgent,
      expires_at: input.expiresAt,
    })
    .execute();
}

export interface MagicLinkRow {
  readonly token_hash: string;
  readonly email: string;
  readonly user_id: number | null;
  readonly used_at: string | null;
  readonly expires_at: string;
}

export async function findValidMagicLink(
  k: Kdb,
  tokenHash: string,
): Promise<MagicLinkRow | undefined> {
  const row = await k
    .selectFrom('magic_link_tokens')
    .select(['token_hash', 'email', 'user_id', 'used_at', 'expires_at'])
    .where('token_hash', '=', tokenHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', sql<string>`datetime('now')`)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function markMagicLinkConsumed(
  k: Kdb,
  tokenHash: string,
  sessionId: number,
): Promise<void> {
  await k
    .updateTable('magic_link_tokens')
    .set({
      used_at: sql<string>`datetime('now')`,
      consumed_by_session_id: sessionId,
    })
    .where('token_hash', '=', tokenHash)
    .execute();
}

export async function countRecentForEmail(
  k: Kdb,
  email: string,
  sinceIso: string,
): Promise<number> {
  const row = await k
    .selectFrom('magic_link_tokens')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where(sql<boolean>`email COLLATE NOCASE = ${email}`)
    .where('created_at', '>', sinceIso)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export async function countRecentForIp(k: Kdb, ip: string, sinceIso: string): Promise<number> {
  const row = await k
    .selectFrom('magic_link_tokens')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('requested_ip', '=', ip)
    .where('created_at', '>', sinceIso)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}
