// Onboarding self-signup : un email inconnu qui consomme un magic link
// devient un user avec rôle viewer global. Le display_name est dérivé de
// la partie locale de l'email (avant le @), nettoyée.

import type { Kdb } from '../db/client.js';
import { createUserWithEmail, findUserByEmail } from '../repositories/user.repo.js';
import { upsertLocalIdentity } from '../repositories/auth-identity.repo.js';
import { grantRole } from '../repositories/user-role.repo.js';

function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  const cleaned = localPart.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return email;
  // Capitalize words
  return cleaned
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export interface OnboardResult {
  readonly userId: number;
  readonly displayName: string;
  readonly email: string;
  readonly created: boolean;
}

export async function onboardOrFindUser(k: Kdb, email: string): Promise<OnboardResult> {
  const existing = await findUserByEmail(k, email);
  if (existing) {
    await upsertLocalIdentity(k, existing.id, email);
    return {
      userId: existing.id,
      displayName: existing.display_name,
      email,
      created: false,
    };
  }
  const created = await createUserWithEmail(k, {
    email,
    displayName: displayNameFromEmail(email),
  });
  await upsertLocalIdentity(k, created.id, email);
  // Rôle par défaut : viewer global (self-signup ouvert).
  await grantRole(k, created.id, 'viewer', null, null);
  return {
    userId: created.id,
    displayName: created.display_name,
    email,
    created: true,
  };
}
