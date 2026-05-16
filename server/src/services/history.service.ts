import type { Db } from '../db/client.js';
import type { RevisionSummary } from '../db/types.js';
import {
  getHeadRevision,
  getRevisionById,
  insertRevision,
  listRevisions as repoListRevisions,
} from '../repositories/revision.repo.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { serializeRevision } from './tree.service.js';

export interface HistoryListResult {
  readonly head_id: number | null;
  readonly revisions: readonly RevisionSummary[];
}

export function listHistory(db: Db, projectId: number, limit: number): HistoryListResult {
  const rows = repoListRevisions(db, projectId, limit);
  const head = getHeadRevision(db, projectId);
  return {
    head_id: head?.id ?? null,
    revisions: rows.map(serializeRevision),
  };
}

export interface RevisionFullResult {
  readonly revision: RevisionSummary;
  readonly tree: unknown;
}

export function getRevision(db: Db, projectId: number, id: number): RevisionFullResult {
  if (!Number.isInteger(id)) throw new ValidationError('invalid_id');
  const row = getRevisionById(db, projectId, id);
  if (!row) throw new NotFoundError('not_found');
  return { revision: serializeRevision(row), tree: JSON.parse(row.tree_json) };
}

export interface RevertResult {
  readonly revision: RevisionSummary;
}

export function revertRevision(
  db: Db,
  projectId: number,
  id: number,
  message: string,
  authorId: number,
  authorName: string,
): RevertResult {
  if (!Number.isInteger(id)) throw new ValidationError('invalid_id');
  const source = getRevisionById(db, projectId, id);
  if (!source) throw new NotFoundError('not_found');
  const head = getHeadRevision(db, projectId);
  const msg = (message || `Revert vers révision #${id}`).slice(0, 200);
  const inserted = insertRevision(db, {
    projectId,
    parentId: head?.id ?? null,
    treeJson: source.tree_json,
    authorId,
    message: msg,
    revertsId: id,
  });
  return {
    revision: {
      id: inserted.id,
      parent_id: inserted.parent_id,
      message: inserted.message,
      created_at: inserted.created_at,
      reverts_id: inserted.reverts_id,
      author: { id: authorId, name: authorName },
    },
  };
}
