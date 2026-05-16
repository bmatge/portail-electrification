import { randomBytes } from 'node:crypto';
import type { Db } from '../db/client.js';
import { upsertUserByName } from '../repositories/user.repo.js';
import { createSession, deleteSession } from '../repositories/session.repo.js';
import type { AuthenticatedUser } from '../db/types.js';

export interface IdentifyResult {
  readonly user: AuthenticatedUser;
  readonly token: string;
}

export function identify(db: Db, name: string): IdentifyResult {
  const user = upsertUserByName(db, name);
  const token = randomBytes(32).toString('hex');
  createSession(db, token, user.id);
  return { user: { id: user.id, name: user.name }, token };
}

export function logout(db: Db, token: string | undefined): void {
  if (!token) return;
  deleteSession(db, token);
}
