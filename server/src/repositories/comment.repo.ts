import type { Db } from '../db/client.js';
import type { CommentRow, CommentMinimalRow, CommentCountRow } from '../db/types.js';

export function listCommentsForNode(
  db: Db,
  projectId: number,
  nodeId: string,
): readonly CommentRow[] {
  return db
    .prepare(
      `SELECT c.id, c.node_id, c.body, c.created_at, c.revision_id,
              u.id AS author_id, u.name AS author_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.project_id = ? AND c.node_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`,
    )
    .all(projectId, nodeId) as readonly CommentRow[];
}

export function countCommentsByNode(db: Db, projectId: number): readonly CommentCountRow[] {
  return db
    .prepare(
      `SELECT node_id, COUNT(*) AS n
       FROM comments
       WHERE project_id = ? AND deleted_at IS NULL
       GROUP BY node_id`,
    )
    .all(projectId) as readonly CommentCountRow[];
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

export function insertComment(db: Db, input: InsertCommentInput): InsertedCommentRow {
  return db
    .prepare(
      `INSERT INTO comments (project_id, node_id, author_id, body, revision_id)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, node_id, body, created_at, revision_id`,
    )
    .get(
      input.projectId,
      input.nodeId,
      input.authorId,
      input.body,
      input.revisionId,
    ) as InsertedCommentRow;
}

export function findCommentById(db: Db, commentId: number): CommentMinimalRow | undefined {
  return db
    .prepare('SELECT id, project_id, author_id FROM comments WHERE id = ? AND deleted_at IS NULL')
    .get(commentId) as CommentMinimalRow | undefined;
}

export function softDeleteComment(db: Db, commentId: number): void {
  db.prepare(`UPDATE comments SET deleted_at = datetime('now') WHERE id = ?`).run(commentId);
}
