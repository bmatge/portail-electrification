import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface AdminUserRow {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
  readonly created_at: string;
  readonly last_login_at: string | null;
}

export async function listAllUsers(k: Kdb): Promise<readonly AdminUserRow[]> {
  return await k
    .selectFrom('users')
    .select(['id', 'display_name', 'email', 'status', 'created_at', 'last_login_at'])
    .orderBy('id', 'asc')
    .execute();
}

export async function setUserStatus(
  k: Kdb,
  userId: number,
  status: 'active' | 'disabled',
): Promise<void> {
  await k
    .updateTable('users')
    .set({ status, updated_at: sql<string>`datetime('now')` })
    .where('id', '=', userId)
    .execute();
}

export interface AuditLogEntry {
  readonly id: number;
  readonly actor_id: number | null;
  readonly action: string;
  readonly project_id: number | null;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
  readonly details: string | null;
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
}

export interface ListAuditOptions {
  readonly action?: string;
  readonly projectId?: number;
  readonly actorId?: number;
  readonly limit?: number;
  readonly before?: number; // cursor : id < before
}

export async function listAuditEntries(
  k: Kdb,
  options: ListAuditOptions = {},
): Promise<readonly AuditLogEntry[]> {
  let q = k
    .selectFrom('audit_log')
    .select([
      'id',
      'actor_id',
      'action',
      'project_id',
      'resource_type',
      'resource_id',
      'details',
      'ip',
      'user_agent',
      'created_at',
    ])
    .orderBy('id', 'desc')
    .limit(Math.min(options.limit ?? 100, 500));
  if (options.action) q = q.where('action', '=', options.action);
  if (options.projectId !== undefined) q = q.where('project_id', '=', options.projectId);
  if (options.actorId !== undefined) q = q.where('actor_id', '=', options.actorId);
  if (options.before !== undefined) q = q.where('id', '<', options.before);
  return await q.execute();
}
