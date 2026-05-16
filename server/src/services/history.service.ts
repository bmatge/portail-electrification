import type { Kdb } from '../db/client.js';
import type { RevisionSummary } from '../db/types.js';
import {
  getHeadRevision,
  getRevisionById,
  insertRevision,
  listRevisions as repoListRevisions,
} from '../repositories/revision.repo.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { serializeRevision } from './tree.service.js';
import { logAudit } from './audit.service.js';

export interface HistoryListResult {
  readonly head_id: number | null;
  readonly revisions: readonly RevisionSummary[];
}

export async function listHistory(
  k: Kdb,
  projectId: number,
  limit: number,
): Promise<HistoryListResult> {
  const [rows, head] = await Promise.all([
    repoListRevisions(k, projectId, limit),
    getHeadRevision(k, projectId),
  ]);
  return {
    head_id: head?.id ?? null,
    revisions: rows.map(serializeRevision),
  };
}

export interface RevisionFullResult {
  readonly revision: RevisionSummary;
  readonly tree: unknown;
}

export async function getRevision(
  k: Kdb,
  projectId: number,
  id: number,
): Promise<RevisionFullResult> {
  if (!Number.isInteger(id)) throw new ValidationError('invalid_id');
  const row = await getRevisionById(k, projectId, id);
  if (!row) throw new NotFoundError('not_found');
  return { revision: serializeRevision(row), tree: JSON.parse(row.tree_json) };
}

export interface RevertInput {
  readonly projectId: number;
  readonly revisionId: number;
  readonly message: string;
  readonly authorId: number;
  readonly authorName: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface RevertResult {
  readonly revision: RevisionSummary;
}

export async function revertRevision(k: Kdb, input: RevertInput): Promise<RevertResult> {
  if (!Number.isInteger(input.revisionId)) throw new ValidationError('invalid_id');
  const source = await getRevisionById(k, input.projectId, input.revisionId);
  if (!source) throw new NotFoundError('not_found');
  const head = await getHeadRevision(k, input.projectId);
  const msg = (input.message || `Revert vers révision #${input.revisionId}`).slice(0, 200);
  const inserted = await insertRevision(k, {
    projectId: input.projectId,
    parentId: head?.id ?? null,
    treeJson: source.tree_json,
    authorId: input.authorId,
    message: msg,
    revertsId: input.revisionId,
  });
  await logAudit(k, 'tree.revert', {
    actorId: input.authorId,
    projectId: input.projectId,
    resourceType: 'revision',
    resourceId: inserted.id,
    details: { reverts: input.revisionId, message: msg },
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
