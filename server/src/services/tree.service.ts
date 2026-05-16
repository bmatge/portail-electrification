import type { Kdb } from '../db/client.js';
import type { RevisionSummary, RevisionWithAuthor } from '../db/types.js';
import { getHeadRevision, insertRevision } from '../repositories/revision.repo.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';
import { logAudit } from './audit.service.js';

export function serializeRevision(row: RevisionWithAuthor): RevisionSummary {
  return {
    id: row.id,
    parent_id: row.parent_id,
    message: row.message,
    created_at: row.created_at,
    reverts_id: row.reverts_id,
    author: { id: row.author_id, name: row.author_name },
  };
}

export interface TreeHead {
  readonly revision: RevisionSummary;
  readonly tree: unknown;
}

export async function getCurrentTree(k: Kdb, projectId: number): Promise<TreeHead> {
  const head = await getHeadRevision(k, projectId);
  if (!head) throw new NotFoundError('no_revision');
  return { revision: serializeRevision(head), tree: JSON.parse(head.tree_json) };
}

export interface SaveTreeInput {
  readonly projectId: number;
  readonly tree: { readonly id: string } & Record<string, unknown>;
  readonly message: string;
  readonly authorId: number;
  readonly authorName: string;
  readonly expectedParent: string | undefined;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface SaveTreeResult {
  readonly revision: RevisionSummary;
}

export async function saveTree(k: Kdb, input: SaveTreeInput): Promise<SaveTreeResult> {
  const head = await getHeadRevision(k, input.projectId);
  if (
    input.expectedParent !== undefined &&
    input.expectedParent !== '' &&
    head &&
    String(head.id) !== input.expectedParent
  ) {
    throw new ConflictError('conflict', 'tree head moved', serializeRevision(head));
  }
  const parentId = head ? head.id : null;
  const msg = input.message.slice(0, 200);
  const inserted = await insertRevision(k, {
    projectId: input.projectId,
    parentId,
    treeJson: JSON.stringify(input.tree),
    authorId: input.authorId,
    message: msg,
  });
  await logAudit(k, 'tree.write', {
    actorId: input.authorId,
    projectId: input.projectId,
    resourceType: 'revision',
    resourceId: inserted.id,
    details: { parent_id: parentId, message: msg },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return {
    revision: {
      id: inserted.id,
      parent_id: inserted.parent_id,
      message: inserted.message,
      created_at: inserted.created_at,
      reverts_id: inserted.reverts_id,
      author: { id: input.authorId, name: input.authorName },
    },
  };
}
