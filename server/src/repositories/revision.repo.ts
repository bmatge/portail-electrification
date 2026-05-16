import type { Db } from '../db/client.js';
import type { RevisionRow, RevisionMetaRow } from '../db/types.js';

export function getHeadRevision(db: Db, projectId: number): RevisionRow | undefined {
  return db
    .prepare(
      `SELECT r.id, r.parent_id, r.tree_json, r.message, r.created_at, r.reverts_id,
              u.name AS author_name, u.id AS author_id
       FROM revisions r
       JOIN users u ON u.id = r.author_id
       WHERE r.project_id = ?
       ORDER BY r.id DESC LIMIT 1`,
    )
    .get(projectId) as RevisionRow | undefined;
}

export function listRevisions(
  db: Db,
  projectId: number,
  limit: number,
): readonly RevisionMetaRow[] {
  return db
    .prepare(
      `SELECT r.id, r.parent_id, r.message, r.created_at, r.reverts_id,
              u.id AS author_id, u.name AS author_name
       FROM revisions r
       JOIN users u ON u.id = r.author_id
       WHERE r.project_id = ?
       ORDER BY r.id DESC
       LIMIT ?`,
    )
    .all(projectId, limit) as readonly RevisionMetaRow[];
}

export function getRevisionById(
  db: Db,
  projectId: number,
  revisionId: number,
): RevisionRow | undefined {
  return db
    .prepare(
      `SELECT r.id, r.parent_id, r.tree_json, r.message, r.created_at, r.reverts_id,
              u.id AS author_id, u.name AS author_name
       FROM revisions r
       JOIN users u ON u.id = r.author_id
       WHERE r.project_id = ? AND r.id = ?`,
    )
    .get(projectId, revisionId) as RevisionRow | undefined;
}

export interface InsertRevisionInput {
  readonly projectId: number;
  readonly parentId: number | null;
  readonly treeJson: string;
  readonly authorId: number;
  readonly message: string;
  readonly revertsId?: number | null;
}

export function insertRevision(db: Db, input: InsertRevisionInput): RevisionMetaRow {
  return db
    .prepare(
      `INSERT INTO revisions (project_id, parent_id, tree_json, author_id, message, reverts_id)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, parent_id, message, created_at, reverts_id, author_id,
                 (SELECT name FROM users WHERE id = author_id) AS author_name`,
    )
    .get(
      input.projectId,
      input.parentId,
      input.treeJson,
      input.authorId,
      input.message,
      input.revertsId ?? null,
    ) as RevisionMetaRow;
}
