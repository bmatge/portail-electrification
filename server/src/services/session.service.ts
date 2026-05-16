import { createHash, randomBytes } from 'node:crypto';
import type { Kdb } from '../db/client.js';
import {
  createSession as repoCreateSession,
  revokeSession,
  revokeAllSessionsForUser,
} from '../repositories/session.repo.js';

export const SESSION_TTL_DAYS = 30;

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface CreateSessionInput {
  readonly userId: number;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface CreatedSession {
  readonly id: number;
  readonly token: string;
  readonly expiresAt: string;
}

export async function createSessionForUser(
  k: Kdb,
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { id } = await repoCreateSession(k, {
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    ip: input.ip,
    userAgent: input.userAgent,
    previousId: null,
    expiresAt,
  });
  return { id, token, expiresAt };
}

export async function revokeOne(k: Kdb, id: number): Promise<void> {
  await revokeSession(k, id);
}

export async function revokeAll(k: Kdb, userId: number): Promise<void> {
  await revokeAllSessionsForUser(k, userId);
}
