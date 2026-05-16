import type { Kdb } from '../db/client.js';
import type { RevisionSummary } from '../db/types.js';
import {
  getHeadRoadmapRevision,
  getRoadmapRevisionById,
  insertRoadmapRevision,
  listRoadmapRevisions as repoListRoadmapRevisions,
} from '../repositories/roadmap-revision.repo.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { serializeRevision } from './tree.service.js';
import { logAudit } from './audit.service.js';

export interface RoadmapHead {
  readonly revision: RevisionSummary;
  readonly roadmap: unknown;
}

export async function getCurrentRoadmap(k: Kdb, projectId: number): Promise<RoadmapHead> {
  const head = await getHeadRoadmapRevision(k, projectId);
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
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface SaveRoadmapResult {
  readonly revision: RevisionSummary;
}

export async function saveRoadmap(k: Kdb, input: SaveRoadmapInput): Promise<SaveRoadmapResult> {
  const head = await getHeadRoadmapRevision(k, input.projectId);
  if (
    input.expectedParent !== undefined &&
    input.expectedParent !== '' &&
    head &&
    String(head.id) !== input.expectedParent
  ) {
    throw new ConflictError('conflict', 'roadmap head moved', serializeRevision(head));
  }
  const parentId = head ? head.id : null;
  const msg = input.message.slice(0, 200);
  const inserted = await insertRoadmapRevision(k, {
    projectId: input.projectId,
    parentId,
    dataJson: JSON.stringify(input.roadmap),
    authorId: input.authorId,
    message: msg,
  });
  await logAudit(k, 'roadmap.write', {
    actorId: input.authorId,
    projectId: input.projectId,
    resourceType: 'roadmap_revision',
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

export interface RoadmapHistoryResult {
  readonly head_id: number | null;
  readonly revisions: readonly RevisionSummary[];
}

export async function listRoadmapHistory(
  k: Kdb,
  projectId: number,
  limit: number,
): Promise<RoadmapHistoryResult> {
  const [rows, head] = await Promise.all([
    repoListRoadmapRevisions(k, projectId, limit),
    getHeadRoadmapRevision(k, projectId),
  ]);
  return { head_id: head?.id ?? null, revisions: rows.map(serializeRevision) };
}

export interface RoadmapRevisionFull {
  readonly revision: RevisionSummary;
  readonly roadmap: unknown;
}

export async function getRoadmapRevision(
  k: Kdb,
  projectId: number,
  id: number,
): Promise<RoadmapRevisionFull> {
  if (!Number.isInteger(id)) throw new ValidationError('invalid_id');
  const row = await getRoadmapRevisionById(k, projectId, id);
  if (!row) throw new NotFoundError('not_found');
  return { revision: serializeRevision(row), roadmap: JSON.parse(row.data_json) };
}
