import type { Kdb } from '../db/client.js';
import type { Role } from '@latelier/shared';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import {
  listAllUsers,
  setUserStatus,
  listAuditEntries,
  type ListAuditOptions,
  type AdminUserRow,
  type AuditLogEntry,
} from '../repositories/admin.repo.js';
import { listRolesForUser, grantRole, revokeRole } from '../repositories/user-role.repo.js';
import { findUserById } from '../repositories/user.repo.js';
import { logAudit } from './audit.service.js';

export interface UserWithRoles extends AdminUserRow {
  readonly roles: readonly { readonly role: Role; readonly projectId: number | null }[];
}

export async function listUsersWithRoles(k: Kdb): Promise<readonly UserWithRoles[]> {
  const users = await listAllUsers(k);
  const out: UserWithRoles[] = [];
  for (const u of users) {
    const roles = await listRolesForUser(k, u.id);
    out.push({
      ...u,
      roles: roles.map((r) => ({ role: r.role, projectId: r.project_id })),
    });
  }
  return out;
}

export interface DisableUserInput {
  readonly userId: number;
  readonly actorId: number;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

export async function disableUser(k: Kdb, input: DisableUserInput): Promise<void> {
  const target = await findUserById(k, input.userId);
  if (!target) throw new NotFoundError('not_found');
  await setUserStatus(k, input.userId, 'disabled');
  await logAudit(k, 'admin.user.disable', {
    actorId: input.actorId,
    resourceType: 'user',
    resourceId: input.userId,
    details: { target_email: target.email },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function enableUser(k: Kdb, input: DisableUserInput): Promise<void> {
  const target = await findUserById(k, input.userId);
  if (!target) throw new NotFoundError('not_found');
  await setUserStatus(k, input.userId, 'active');
  await logAudit(k, 'admin.user.enable', {
    actorId: input.actorId,
    resourceType: 'user',
    resourceId: input.userId,
    details: { target_email: target.email },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export interface GrantRoleInput {
  readonly targetUserId: number;
  readonly role: Role;
  readonly projectId: number | null;
  readonly actorId: number;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

const VALID_ROLES = new Set<Role>(['admin', 'editor', 'viewer']);

export async function grantRoleToUser(k: Kdb, input: GrantRoleInput): Promise<void> {
  if (!VALID_ROLES.has(input.role)) throw new ValidationError('validation_error', 'invalid_role');
  const target = await findUserById(k, input.targetUserId);
  if (!target) throw new NotFoundError('not_found');
  await grantRole(k, input.targetUserId, input.role, input.projectId, input.actorId);
  await logAudit(k, 'admin.role.grant', {
    actorId: input.actorId,
    projectId: input.projectId,
    resourceType: 'user_role',
    resourceId: `${input.targetUserId}:${input.role}`,
    details: { target_id: input.targetUserId, role: input.role, projectId: input.projectId },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function revokeRoleFromUser(k: Kdb, input: GrantRoleInput): Promise<void> {
  if (!VALID_ROLES.has(input.role)) throw new ValidationError('validation_error', 'invalid_role');
  await revokeRole(k, input.targetUserId, input.role, input.projectId);
  await logAudit(k, 'admin.role.revoke', {
    actorId: input.actorId,
    projectId: input.projectId,
    resourceType: 'user_role',
    resourceId: `${input.targetUserId}:${input.role}`,
    details: { target_id: input.targetUserId, role: input.role, projectId: input.projectId },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function readAuditLog(
  k: Kdb,
  options: ListAuditOptions,
): Promise<readonly AuditLogEntry[]> {
  return listAuditEntries(k, options);
}
