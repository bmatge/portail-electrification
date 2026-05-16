import type { Kdb } from '../db/client.js';
import {
  hasPermission as sharedHasPermission,
  type Permission,
  type RoleGrant,
} from '@latelier/shared';
import { listRolesForUser } from '../repositories/user-role.repo.js';

export type { Permission } from '@latelier/shared';

export async function loadGrantsForUser(k: Kdb, userId: number): Promise<readonly RoleGrant[]> {
  const rows = await listRolesForUser(k, userId);
  return rows.map((r) => ({ role: r.role, projectId: r.project_id }));
}

export function hasPermission(
  grants: readonly RoleGrant[],
  permission: Permission,
  projectId: number | null = null,
): boolean {
  return sharedHasPermission(grants, permission, projectId);
}
