import { createHash, randomBytes } from 'node:crypto';
import type { Kdb } from '../db/client.js';
import type { Mailer } from './mailer.service.js';
import {
  insertMagicLink,
  countRecentForEmail,
  countRecentForIp,
} from '../repositories/magic-link.repo.js';
import { findUserByEmail } from '../repositories/user.repo.js';
import { AppError } from '../domain/errors.js';

export const TOKEN_TTL_MIN = 15;
const MAX_PER_HOUR_PER_EMAIL = 3;
const MAX_PER_MINUTE_PER_IP = 10;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface RequestMagicLinkInput {
  readonly email: string;
  readonly baseUrl: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export async function requestMagicLink(
  k: Kdb,
  mailer: Mailer,
  input: RequestMagicLinkInput,
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new AppError(400, 'validation_error', 'invalid email');
  }

  // Rate limit léger (anti-bruteforce, anti-spam) — best-effort en DB.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const [perEmail, perIp] = await Promise.all([
    countRecentForEmail(k, email, oneHourAgo),
    input.ip ? countRecentForIp(k, input.ip, oneMinuteAgo) : Promise.resolve(0),
  ]);
  if (perEmail >= MAX_PER_HOUR_PER_EMAIL) {
    throw new AppError(429, 'rate_limited');
  }
  if (perIp >= MAX_PER_MINUTE_PER_IP) {
    throw new AppError(429, 'rate_limited');
  }

  const token = randomBytes(32).toString('base64url');
  const existing = await findUserByEmail(k, email);

  await insertMagicLink(k, {
    tokenHash: hashToken(token),
    email,
    userId: existing?.id ?? null,
    ip: input.ip,
    userAgent: input.userAgent,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000).toISOString(),
  });

  const callbackUrl = `${input.baseUrl}/api/auth/callback?token=${encodeURIComponent(token)}`;
  await mailer.sendMagicLink(email, callbackUrl, token);
}
