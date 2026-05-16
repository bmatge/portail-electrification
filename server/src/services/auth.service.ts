// Auth orchestrator : magic link request + callback. Le rate-limit et le
// hashing vivent dans magic-link.service.ts ; ici on coordonne callback ↔
// onboarding ↔ session.

import type { Kdb } from '../db/client.js';
import type { Mailer } from './mailer.service.js';
import { requestMagicLink, hashToken } from './magic-link.service.js';
import { findValidMagicLink, markMagicLinkConsumed } from '../repositories/magic-link.repo.js';
import { setUserLastLogin } from '../repositories/user.repo.js';
import { onboardOrFindUser } from './user-onboarding.service.js';
import { createSessionForUser, revokeOne, revokeAll } from './session.service.js';
import { logAudit } from './audit.service.js';
import { AppError, ForbiddenError } from '../domain/errors.js';

export interface RequestMagicLinkArgs {
  readonly email: string;
  readonly baseUrl: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export async function requestLogin(
  k: Kdb,
  mailer: Mailer,
  args: RequestMagicLinkArgs,
): Promise<void> {
  // Délègue : valide email + rate-limit + insert + envoi.
  await requestMagicLink(k, mailer, args);
}

export interface ConsumeCallbackArgs {
  readonly token: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface ConsumeCallbackResult {
  readonly token: string;
  readonly sessionId: number;
  readonly expiresAt: string;
  readonly userId: number;
  readonly created: boolean;
}

export async function consumeCallback(
  k: Kdb,
  args: ConsumeCallbackArgs,
): Promise<ConsumeCallbackResult> {
  const hash = hashToken(args.token);
  const row = await findValidMagicLink(k, hash);
  if (!row) throw new AppError(400, 'validation_error', 'invalid_or_expired_token');

  const onboard = await onboardOrFindUser(k, row.email);
  const session = await createSessionForUser(k, {
    userId: onboard.userId,
    ip: args.ip,
    userAgent: args.userAgent,
  });
  await markMagicLinkConsumed(k, hash, session.id);
  await setUserLastLogin(k, onboard.userId);

  await logAudit(k, 'auth.identify', {
    actorId: onboard.userId,
    resourceType: 'session',
    resourceId: session.id,
    details: { email: row.email, created: onboard.created },
    ip: args.ip,
    userAgent: args.userAgent,
  });

  return {
    token: session.token,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    userId: onboard.userId,
    created: onboard.created,
  };
}

export async function logoutOne(k: Kdb, sessionId: number | undefined): Promise<void> {
  if (!sessionId) return;
  await revokeOne(k, sessionId);
}

export async function logoutAll(k: Kdb, userId: number | undefined): Promise<void> {
  if (!userId) throw new ForbiddenError();
  await revokeAll(k, userId);
}
