// Bootstrap admin : promeut une liste d'emails en `admin global` au boot
// du serveur. Idempotent — ne refait rien si le grant existe déjà.
//
// Cas d'usage :
//   - Setup initial d'une nouvelle instance (sinon la page /admin est
//     inaccessible : aucun user n'a le rôle admin par défaut, le
//     self-signup donne `viewer`).
//   - Beta déployée à nouveau avec une DB neuve : ré-applique le
//     bootstrap sans avoir à se logger via magic link puis bidouiller
//     la DB.
//
// Source de vérité : env var `BOOTSTRAP_ADMIN_EMAILS` (string CSV).

import type { Kdb } from '../db/client.js';
import { logger } from '../logger.js';
import {
  createUserWithEmail,
  ensureSystemUser,
  findUserByEmail,
} from '../repositories/user.repo.js';
import { grantRole, listRolesForUser } from '../repositories/user-role.repo.js';
import { logAudit } from './audit.service.js';

export interface BootstrapResult {
  readonly email: string;
  readonly action: 'created' | 'granted' | 'already_admin' | 'skipped';
  readonly userId?: number;
}

export async function seedBootstrapAdmins(
  k: Kdb,
  emails: readonly string[],
): Promise<readonly BootstrapResult[]> {
  if (emails.length === 0) return [];

  const sysUser = await ensureSystemUser(k);
  const results: BootstrapResult[] = [];

  for (const rawEmail of emails) {
    const email = rawEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      results.push({ email: rawEmail, action: 'skipped' });
      continue;
    }

    // 1. Trouver ou créer l'user
    let user = await findUserByEmail(k, email);
    let created = false;
    if (!user) {
      const localPart = email.split('@')[0] ?? email;
      const displayName = localPart.charAt(0).toUpperCase() + localPart.slice(1);
      user = await createUserWithEmail(k, { email, displayName });
      created = true;
    }

    // 2. Vérifier s'il a déjà admin global
    const grants = await listRolesForUser(k, user.id);
    const hasAdminGlobal = grants.some((g) => g.role === 'admin' && g.project_id === null);

    if (hasAdminGlobal && !created) {
      results.push({ email, action: 'already_admin', userId: user.id });
      continue;
    }

    // 3. Grant admin global
    if (!hasAdminGlobal) {
      await grantRole(k, user.id, 'admin', null, sysUser.id);
      await logAudit(k, 'admin.role.grant', {
        actorId: sysUser.id,
        projectId: null,
        resourceType: 'user_role',
        resourceId: `${user.id}:admin`,
        details: {
          target_id: user.id,
          role: 'admin',
          projectId: null,
          source: 'bootstrap',
        },
      });
    }

    results.push({
      email,
      action: created ? 'created' : 'granted',
      userId: user.id,
    });
  }

  for (const r of results) {
    logger.info({ email: r.email, action: r.action, userId: r.userId }, 'bootstrap_admin');
  }
  return results;
}
