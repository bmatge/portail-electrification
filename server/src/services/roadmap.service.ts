import type { Db } from '../db/client.js';
import type { RevisionSummary } from '../db/types.js';
import {
  getHeadRoadmapRevision,
  getRoadmapRevisionById,
  insertRoadmapRevision,
  listRoadmapRevisions as repoListRoadmapRevisions,
} from '../repositories/roadmap-revision.repo.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { serializeRevision } from './tree.service.js';

export interface RoadmapHead {
  readonly revision: RevisionSummary;
  readonly roadmap: unknown;
}

export function getCurrentRoadmap(db: Db, projectId: number): RoadmapHead {
  const head = getHeadRoadmapRevision(db, projectId);
  if (!head) throw new NotFoundError('no_revision');
  return { revision: serializeRevision(head), roadmap: JSON.parse(head.data_json) };
}

export interface SaveRoadmapInput {
  readonly projectId: number;
  readonly roadmap: { readonly items: readonly unknown[] } & Record<string, unknown>;
  readonly message: string;
  readonly authorId: number;
  readonly authorName: string;
  readonly expectedParent: string | undefined;
}

export interface SaveRoadmapResult {
  readonly revision: RevisionSummary;
}

export function saveRoadmap(db: Db, input: SaveRoadmapInput): SaveRoadmapResult {
  const head = getHeadRoadmapRevision(db, input.projectId);
  if (
    input.expectedParent !== undefined &&
    input.expectedParent !== '' &&
    head &&
    String(head.id) !== input.expectedParent
  ) {
    throw new ConflictError('conflict', 'roadmap head moved', serializeRevision(head));
  }
  const parentId = head ? head.id : null;
  const inserted = insertRoadmapRevision(db, {
    projectId: input.projectId,
    parentId,
    dataJson: JSON.stringify(input.roadmap),
    authorId: input.authorId,
    message: input.message.slice(0, 200),
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

export interface RoadmapHistoryResult {
  readonly head_id: number | null;
  readonly revisions: readonly RevisionSummary[];
}

export function listRoadmapHistory(db: Db, projectId: number, limit: number): RoadmapHistoryResult {
  const rows = repoListRoadmapRevisions(db, projectId, limit);
  const head = getHeadRoadmapRevision(db, projectId);
  return { head_id: head?.id ?? null, revisions: rows.map(serializeRevision) };
}

export interface RoadmapRevisionFull {
  readonly revision: RevisionSummary;
  readonly roadmap: unknown;
}

export function getRoadmapRevision(db: Db, projectId: number, id: number): RoadmapRevisionFull {
  if (!Number.isInteger(id)) throw new ValidationError('invalid_id');
  const row = getRoadmapRevisionById(db, projectId, id);
  if (!row) throw new NotFoundError('not_found');
  return { revision: serializeRevision(row), roadmap: JSON.parse(row.data_json) };
}
