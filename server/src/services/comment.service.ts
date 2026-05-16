import type { Kdb } from '../db/client.js';
import type { RoleGrant } from '@latelier/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/errors.js';
import {
  countCommentsByNode,
  findCommentById,
  insertComment,
  listCommentsForNode,
  softDeleteComment,
} from '../repositories/comment.repo.js';
import { getHeadRevision } from '../repositories/revision.repo.js';
import { hasPermission } from './rbac.service.js';
import { logAudit } from './audit.service.js';

export interface CommentDto {
  readonly id: number;
  readonly node_id: string;
  readonly body: string;
  readonly created_at: string;
  readonly revision_id: number | null;
  readonly author: { readonly id: number; readonly name: string };
}

export async function getCountsForProject(
  k: Kdb,
  projectId: number,
): Promise<Readonly<Record<string, number>>> {
  const rows = await countCommentsByNode(k, projectId);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.node_id] = r.n;
  return counts;
}

export async function listForNode(
  k: Kdb,
  projectId: number,
  nodeId: string,
): Promise<readonly CommentDto[]> {
  const rows = await listCommentsForNode(k, projectId, nodeId);
  return rows.map((row) => ({
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
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function createComment(k: Kdb, input: CreateCommentInput): Promise<CommentDto> {
  const nodeId = input.nodeId.trim();
  const body = input.body.trim();
  if (!nodeId) throw new ValidationError('node_id_required');
  if (!body) throw new ValidationError('body_required');
  if (body.length > 4000) throw new ValidationError('body_too_long');

  const head = await getHeadRevision(k, input.projectId);
  const inserted = await insertComment(k, {
    projectId: input.projectId,
    nodeId,
    authorId: input.authorId,
    body,
    revisionId: head?.id ?? null,
  });
  await logAudit(k, 'comment.create', {
    actorId: input.authorId,
    projectId: input.projectId,
    resourceType: 'comment',
    resourceId: inserted.id,
    details: { node_id: nodeId, length: body.length },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
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

export interface DeleteCommentInput {
  readonly projectId: number;
  readonly commentId: number;
  readonly actorId: number;
  readonly actorGrants: readonly RoleGrant[];
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function deleteComment(k: Kdb, input: DeleteCommentInput): Promise<void> {
  if (!Number.isInteger(input.commentId)) throw new ValidationError('invalid_id');
  const c = await findCommentById(k, input.commentId);
  if (!c || c.project_id !== input.projectId) throw new NotFoundError('not_found');
  const isOwner = c.author_id === input.actorId;
  const canAny = hasPermission(input.actorGrants, 'comments:delete:any', input.projectId);
  if (!isOwner && !canAny) throw new ForbiddenError();
  await softDeleteComment(k, input.commentId);
  await logAudit(k, 'comment.delete', {
    actorId: input.actorId,
    projectId: input.projectId,
    resourceType: 'comment',
    resourceId: input.commentId,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
