// Wrapper synchrone d'écriture dans la table audit_log. Best-effort : si
// l'insertion échoue (DB indisponible…), on log mais on ne casse pas l'action
// utilisateur. Les détails JSON sont sérialisés ici pour éviter d'avoir à
// le faire dans chaque appelant.

import type { Kdb } from '../db/client.js';
import { insertAuditEntry } from '../repositories/audit-log.repo.js';

export type AuditAction =
  | 'project.create'
  | 'project.delete'
  | 'project.import'
  | 'tree.write'
  | 'tree.revert'
  | 'roadmap.write'
  | 'comment.create'
  | 'comment.delete'
  | 'data.write'
  | 'auth.identify'
  | 'auth.logout'
  | 'admin.user.disable'
  | 'admin.user.enable'
  | 'admin.role.grant'
  | 'admin.role.revoke';

export interface AuditContext {
  readonly actorId: number | null;
  readonly projectId?: number | null;
  readonly resourceType?: string | null;
  readonly resourceId?: string | number | null;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export async function logAudit(k: Kdb, action: AuditAction, ctx: AuditContext): Promise<void> {
  try {
    await insertAuditEntry(k, {
      actorId: ctx.actorId,
      action,
      projectId: ctx.projectId ?? null,
      resourceType: ctx.resourceType ?? null,
      resourceId:
        ctx.resourceId !== undefined && ctx.resourceId !== null ? String(ctx.resourceId) : null,
      details: ctx.details ? JSON.stringify(ctx.details) : null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  } catch (err) {
    // Best-effort : un échec d'audit ne doit jamais empêcher l'action.
    console.error('[audit] insert failed', action, err);
  }
}
