import type { Db } from '../db/client.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/errors.js';
import {
  countCommentsByNode,
  findCommentById,
  insertComment,
  listCommentsForNode,
  softDeleteComment,
} from '../repositories/comment.repo.js';
import { getHeadRevision } from '../repositories/revision.repo.js';

export interface CommentDto {
  readonly id: number;
  readonly node_id: string;
  readonly body: string;
  readonly created_at: string;
  readonly revision_id: number | null;
  readonly author: { readonly id: number; readonly name: string };
}

export function getCountsForProject(db: Db, projectId: number): Readonly<Record<string, number>> {
  const rows = countCommentsByNode(db, projectId);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.node_id] = r.n;
  return counts;
}

export function listForNode(db: Db, projectId: number, nodeId: string): readonly CommentDto[] {
  return listCommentsForNode(db, projectId, nodeId).map((row) => ({
    id: row.id,
    node_id: row.node_id,
    body: row.body,
    created_at: row.created_at,
    revision_id: row.revision_id,
    author: { id: row.author_id, name: row.author_name },
  }));
}

export interface CreateCommentInput {
  readonly projectId: number;
  readonly nodeId: string;
  readonly body: string;
  readonly authorId: number;
  readonly authorName: string;
}

export function createComment(db: Db, input: CreateCommentInput): CommentDto {
  const nodeId = input.nodeId.trim();
  const body = input.body.trim();
  if (!nodeId) throw new ValidationError('node_id_required');
  if (!body) throw new ValidationError('body_required');
  if (body.length > 4000) throw new ValidationError('body_too_long');

  const head = getHeadRevision(db, input.projectId);
  const inserted = insertComment(db, {
    projectId: input.projectId,
    nodeId,
    authorId: input.authorId,
    body,
    revisionId: head?.id ?? null,
  });
  return {
    id: inserted.id,
    node_id: inserted.node_id,
    body: inserted.body,
    created_at: inserted.created_at,
    revision_id: inserted.revision_id,
    author: { id: input.authorId, name: input.authorName },
  };
}

export function deleteComment(
  db: Db,
  projectId: number,
  commentId: number,
  actingUserId: number,
): void {
  if (!Number.isInteger(commentId)) throw new ValidationError('invalid_id');
  const c = findCommentById(db, commentId);
  if (!c || c.project_id !== projectId) throw new NotFoundError('not_found');
  if (c.author_id !== actingUserId) throw new ForbiddenError();
  softDeleteComment(db, commentId);
}
