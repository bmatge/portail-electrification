import { randomBytes } from 'node:crypto';
import type { Kdb } from '../db/client.js';
import { upsertUserByName } from '../repositories/user.repo.js';
import { createSession, deleteSession } from '../repositories/session.repo.js';
import type { AuthenticatedUser } from '../db/types.js';

export interface IdentifyResult {
  readonly user: AuthenticatedUser;
  readonly token: string;
}

export async function identify(k: Kdb, name: string): Promise<IdentifyResult> {
  const user = await upsertUserByName(k, name);
  const token = randomBytes(32).toString('hex');
  await createSession(k, token, user.id);
  return { user: { id: user.id, name: user.name }, token };
}

export async function logout(k: Kdb, token: string | undefined): Promise<void> {
  if (!token) return;
  await deleteSession(k, token);
}
