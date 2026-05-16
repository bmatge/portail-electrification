import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface CommentWithAuthorRow {
  readonly id: number;
  readonly node_id: string;
  readonly body: string;
  readonly created_at: string;
  readonly revision_id: number | null;
  readonly author_id: number;
  readonly author_name: string;
}

export interface CommentMinimal {
  readonly id: number;
  readonly project_id: number;
  readonly author_id: number;
}

export interface CommentCount {
  readonly node_id: string;
  readonly n: number;
}

export async function listCommentsForNode(
  k: Kdb,
  projectId: number,
  nodeId: string,
): Promise<readonly CommentWithAuthorRow[]> {
  return await k
    .selectFrom('comments as c')
    .innerJoin('users as u', 'u.id', 'c.author_id')
    .select([
      'c.id',
      'c.node_id',
      'c.body',
      'c.created_at',
      'c.revision_id',
      'u.id as author_id',
      'u.name as author_name',
    ])
    .where('c.project_id', '=', projectId)
    .where('c.node_id', '=', nodeId)
    .where('c.deleted_at', 'is', null)
    .orderBy('c.created_at', 'asc')
    .execute();
}

export async function countCommentsByNode(
  k: Kdb,
  projectId: number,
): Promise<readonly CommentCount[]> {
  const rows = await k
    .selectFrom('comments')
    .select((eb) => ['node_id', eb.fn.countAll<number>().as('n')])
    .where('project_id', '=', projectId)
    .where('deleted_at', 'is', null)
    .groupBy('node_id')
    .execute();
  return rows.map((r) => ({ node_id: r.node_id, n: Number(r.n) }));
}

export interface InsertCommentInput {
  readonly projectId: number;
  readonly nodeId: string;
  readonly authorId: number;
  readonly body: string;
  readonly revisionId: number | null;
}

export interface InsertedCommentRow {
  readonly id: number;
  readonly node_id: string;
  readonly body: string;
  readonly created_at: string;
  readonly revision_id: number | null;
}

export async function insertComment(
  k: Kdb,
  input: InsertCommentInput,
): Promise<InsertedCommentRow> {
  return await k
    .insertInto('comments')
    .values({
      project_id: input.projectId,
      node_id: input.nodeId,
      author_id: input.authorId,
      body: input.body,
      revision_id: input.revisionId,
    })
    .returning(['id', 'node_id', 'body', 'created_at', 'revision_id'])
    .executeTakeFirstOrThrow();
}

export async function findCommentById(
  k: Kdb,
  commentId: number,
): Promise<CommentMinimal | undefined> {
  const row = await k
    .selectFrom('comments')
    .select(['id', 'project_id', 'author_id'])
    .where('id', '=', commentId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function softDeleteComment(k: Kdb, commentId: number): Promise<void> {
  await k
    .updateTable('comments')
    .set({ deleted_at: sql<string>`datetime('now')` })
    .where('id', '=', commentId)
    .execute();
}
