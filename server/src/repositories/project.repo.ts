import type { Db } from '../db/client.js';
import type { Project, ProjectListItem } from '../db/types.js';

export function getProjectBySlug(db: Db, slug: string): Project | undefined {
  return db
    .prepare(
      'SELECT id, slug, name, description, created_at FROM projects WHERE slug = ? COLLATE NOCASE',
    )
    .get(slug) as Project | undefined;
}

export function getProjectById(db: Db, id: number): Project | undefined {
  return db
    .prepare('SELECT id, slug, name, description, created_at FROM projects WHERE id = ?')
    .get(id) as Project | undefined;
}

export function listProjects(db: Db): readonly ProjectListItem[] {
  return db
    .prepare(
      `SELECT p.id, p.slug, p.name, p.description, p.created_at,
              (SELECT COUNT(*) FROM revisions WHERE project_id = p.id) AS revision_count
       FROM projects p
       ORDER BY p.created_at ASC`,
    )
    .all() as readonly ProjectListItem[];
}

export interface InsertProjectInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export function insertProject(db: Db, input: InsertProjectInput): number {
  const info = db
    .prepare('INSERT INTO projects (slug, name, description) VALUES (?, ?, ?)')
    .run(input.slug, input.name, input.description);
  return Number(info.lastInsertRowid);
}

export function deleteProjectRow(db: Db, projectId: number): number {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(projectId).changes;
}

export function deleteCommentsForProject(db: Db, projectId: number): void {
  db.prepare('DELETE FROM comments WHERE project_id = ?').run(projectId);
}

export function deleteRevisionsForProject(db: Db, projectId: number): void {
  db.prepare('DELETE FROM revisions WHERE project_id = ?').run(projectId);
}

export function deleteRoadmapRevisionsForProject(db: Db, projectId: number): void {
  db.prepare('DELETE FROM roadmap_revisions WHERE project_id = ?').run(projectId);
}
