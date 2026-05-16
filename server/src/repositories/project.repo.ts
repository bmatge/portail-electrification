import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';
import type { Project, ProjectListItem } from '../db/types.js';

interface ProjectRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly created_at: string;
  readonly created_by: number | null;
  readonly is_public: number;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    created_at: row.created_at,
    created_by: row.created_by,
    is_public: row.is_public === 1,
  };
}

export async function getProjectBySlug(k: Kdb, slug: string): Promise<Project | undefined> {
  const row = await k
    .selectFrom('projects')
    .select(['id', 'slug', 'name', 'description', 'created_at', 'created_by', 'is_public'])
    .where(sql<boolean>`slug COLLATE NOCASE = ${slug}`)
    .executeTakeFirst();
  return row ? toProject(row) : undefined;
}

export async function getProjectById(k: Kdb, id: number): Promise<Project | undefined> {
  const row = await k
    .selectFrom('projects')
    .select(['id', 'slug', 'name', 'description', 'created_at', 'created_by', 'is_public'])
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? toProject(row) : undefined;
}

export async function listProjects(k: Kdb): Promise<readonly ProjectListItem[]> {
  const rows = await k
    .selectFrom('projects as p')
    .select((eb) => [
      'p.id',
      'p.slug',
      'p.name',
      'p.description',
      'p.created_at',
      'p.created_by',
      'p.is_public',
      eb
        .selectFrom('revisions')
        .select((eb2) => eb2.fn.countAll<number>().as('n'))
        .whereRef('revisions.project_id', '=', 'p.id')
        .as('revision_count'),
    ])
    .orderBy('p.created_at', 'asc')
    .execute();
  return rows.map((r) => ({
    ...toProject(r),
    revision_count: Number(r.revision_count ?? 0),
  }));
}

export interface InsertProjectInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly createdBy?: number | null;
  readonly isPublic?: boolean;
}

export async function insertProject(k: Kdb, input: InsertProjectInput): Promise<number> {
  const inserted = await k
    .insertInto('projects')
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description,
      created_by: input.createdBy ?? null,
      ...(input.isPublic !== undefined ? { is_public: input.isPublic ? 1 : 0 } : {}),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return inserted.id;
}

export async function updateProjectIsPublic(
  k: Kdb,
  projectId: number,
  isPublic: boolean,
): Promise<number> {
  const result = await k
    .updateTable('projects')
    .set({ is_public: isPublic ? 1 : 0 })
    .where('id', '=', projectId)
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
}

export async function deleteProjectRow(k: Kdb, projectId: number): Promise<number> {
  const result = await k.deleteFrom('projects').where('id', '=', projectId).executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

export async function deleteCommentsForProject(k: Kdb, projectId: number): Promise<void> {
  await k.deleteFrom('comments').where('project_id', '=', projectId).execute();
}

export async function deleteRevisionsForProject(k: Kdb, projectId: number): Promise<void> {
  await k.deleteFrom('revisions').where('project_id', '=', projectId).execute();
}

export async function deleteRoadmapRevisionsForProject(k: Kdb, projectId: number): Promise<void> {
  await k.deleteFrom('roadmap_revisions').where('project_id', '=', projectId).execute();
}
