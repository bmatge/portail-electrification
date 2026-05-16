import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface AuthIdentity {
  readonly user_id: number;
  readonly provider: 'local' | 'proconnect';
  readonly provider_subject: string;
}

export async function upsertLocalIdentity(k: Kdb, userId: number, email: string): Promise<void> {
  await k
    .insertInto('auth_identities')
    .values({
      user_id: userId,
      provider: 'local',
      provider_subject: email.toLowerCase(),
      email_verified: 1,
      last_used_at: sql<string>`datetime('now')`,
    })
    .onConflict((oc) =>
      oc.columns(['provider', 'provider_subject']).doUpdateSet({
        user_id: userId,
        email_verified: 1,
        last_used_at: sql<string>`datetime('now')`,
      }),
    )
    .execute();
}
