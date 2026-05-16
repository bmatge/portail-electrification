import type { Kdb } from '../db/client.js';

export interface InsertAuditEntryInput {
  readonly actorId: number | null;
  readonly action: string;
  readonly projectId: number | null;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly details: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export async function insertAuditEntry(k: Kdb, input: InsertAuditEntryInput): Promise<void> {
  await k
    .insertInto('audit_log')
    .values({
      actor_id: input.actorId,
      action: input.action,
      project_id: input.projectId,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      details: input.details,
      ip: input.ip,
      user_agent: input.userAgent,
    })
    .execute();
}
