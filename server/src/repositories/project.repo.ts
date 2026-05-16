import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';
import type { Project, ProjectListItem } from '../db/types.js';

export async function getProjectBySlug(k: Kdb, slug: string): Promise<Project | undefined> {
  const row = await k
    .selectFrom('projects')
    .select(['id', 'slug', 'name', 'description', 'created_at'])
    .where(sql<boolean>`slug COLLATE NOCASE = ${slug}`)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function getProjectById(k: Kdb, id: number): Promise<Project | undefined> {
  const row = await k
    .selectFrom('projects')
    .select(['id', 'slug', 'name', 'description', 'created_at'])
    .where('id', '=', id)
    .executeTakeFirst();
  return row ?? undefined;
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
      eb
        .selectFrom('revisions')
        .select((eb2) => eb2.fn.countAll<number>().as('n'))
        .whereRef('revisions.project_id', '=', 'p.id')
        .as('revision_count'),
    ])
    .orderBy('p.created_at', 'asc')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    created_at: r.created_at,
    revision_count: Number(r.revision_count ?? 0),
  }));
}

export interface InsertProjectInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export async function insertProject(k: Kdb, input: InsertProjectInput): Promise<number> {
  const inserted = await k
    .insertInto('projects')
    .values({ slug: input.slug, name: input.name, description: input.description })
    .returning('id')
    .executeTakeFirstOrThrow();
  return inserted.id;
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
