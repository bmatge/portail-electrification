import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';
import type { Role } from '@latelier/shared';

export interface RoleRow {
  readonly id: number;
  readonly user_id: number;
  readonly project_id: number | null;
  readonly role: Role;
}

export async function listRolesForUser(k: Kdb, userId: number): Promise<readonly RoleRow[]> {
  return (await k
    .selectFrom('user_roles')
    .select(['id', 'user_id', 'project_id', 'role'])
    .where('user_id', '=', userId)
    .execute()) as readonly RoleRow[];
}

export async function listRolesGlobal(k: Kdb): Promise<readonly RoleRow[]> {
  return (await k
    .selectFrom('user_roles')
    .select(['id', 'user_id', 'project_id', 'role'])
    .execute()) as readonly RoleRow[];
}

export async function grantRole(
  k: Kdb,
  userId: number,
  role: Role,
  projectId: number | null,
  grantedBy: number | null,
): Promise<void> {
  // L'index UNIQUE est sur une expression IFNULL(project_id, 0) — Kysely ne
  // peut pas le cibler via `oc.column(...)`. On utilise SQLite `INSERT OR
  // IGNORE` qui respecte la contrainte d'unicité quel qu'elle soit.
  await sql`INSERT OR IGNORE INTO user_roles (user_id, project_id, role, granted_by)
            VALUES (${userId}, ${projectId}, ${role}, ${grantedBy})`.execute(k);
}

export async function revokeRole(
  k: Kdb,
  userId: number,
  role: Role,
  projectId: number | null,
): Promise<void> {
  let q = k.deleteFrom('user_roles').where('user_id', '=', userId).where('role', '=', role);
  if (projectId === null) {
    q = q.where('project_id', 'is', null);
  } else {
    q = q.where('project_id', '=', projectId);
  }
  await q.execute();
}
