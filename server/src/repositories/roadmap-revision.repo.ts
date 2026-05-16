import type { Db } from '../db/client.js';
import type { RoadmapRevisionRow, RevisionMetaRow } from '../db/types.js';

export function getHeadRoadmapRevision(db: Db, projectId: number): RoadmapRevisionRow | undefined {
  return db
    .prepare(
      `SELECT r.id, r.parent_id, r.data_json, r.message, r.created_at, r.reverts_id,
              u.name AS author_name, u.id AS author_id
       FROM roadmap_revisions r
       JOIN users u ON u.id = r.author_id
       WHERE r.project_id = ?
       ORDER BY r.id DESC LIMIT 1`,
    )
    .get(projectId) as RoadmapRevisionRow | undefined;
}

export function listRoadmapRevisions(
  db: Db,
  projectId: number,
  limit: number,
): readonly RevisionMetaRow[] {
  return db
    .prepare(
      `SELECT r.id, r.parent_id, r.message, r.created_at, r.reverts_id,
              u.id AS author_id, u.name AS author_name
       FROM roadmap_revisions r
       JOIN users u ON u.id = r.author_id
       WHERE r.project_id = ?
       ORDER BY r.id DESC
       LIMIT ?`,
    )
    .all(projectId, limit) as readonly RevisionMetaRow[];
}

export function getRoadmapRevisionById(
  db: Db,
  projectId: number,
  revisionId: number,
): RoadmapRevisionRow | undefined {
  return db
    .prepare(
      `SELECT r.id, r.parent_id, r.data_json, r.message, r.created_at, r.reverts_id,
              u.id AS author_id, u.name AS author_name
       FROM roadmap_revisions r
       JOIN users u ON u.id = r.author_id
       WHERE r.project_id = ? AND r.id = ?`,
    )
    .get(projectId, revisionId) as RoadmapRevisionRow | undefined;
}

export interface InsertRoadmapRevisionInput {
  readonly projectId: number;
  readonly parentId: number | null;
  readonly dataJson: string;
  readonly authorId: number;
  readonly message: string;
}

export function insertRoadmapRevision(db: Db, input: InsertRoadmapRevisionInput): RevisionMetaRow {
  return db
    .prepare(
      `INSERT INTO roadmap_revisions (project_id, parent_id, data_json, author_id, message)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, parent_id, message, created_at, reverts_id, author_id,
                 (SELECT name FROM users WHERE id = author_id) AS author_name`,
    )
    .get(
      input.projectId,
      input.parentId,
      input.dataJson,
      input.authorId,
      input.message,
    ) as RevisionMetaRow;
}
