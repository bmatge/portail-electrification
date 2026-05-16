import type { Kdb } from '../db/client.js';
import type { RevisionWithAuthor, RevisionWithRoadmap } from '../db/types.js';

export async function getHeadRoadmapRevision(
  k: Kdb,
  projectId: number,
): Promise<RevisionWithRoadmap | undefined> {
  const row = await k
    .selectFrom('roadmap_revisions as r')
    .innerJoin('users as u', 'u.id', 'r.author_id')
    .select([
      'r.id',
      'r.parent_id',
      'r.data_json',
      'r.message',
      'r.created_at',
      'r.reverts_id',
      'u.display_name as author_name',
      'u.id as author_id',
    ])
    .where('r.project_id', '=', projectId)
    .orderBy('r.id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function listRoadmapRevisions(
  k: Kdb,
  projectId: number,
  limit: number,
): Promise<readonly RevisionWithAuthor[]> {
  return await k
    .selectFrom('roadmap_revisions as r')
    .innerJoin('users as u', 'u.id', 'r.author_id')
    .select([
      'r.id',
      'r.parent_id',
      'r.message',
      'r.created_at',
      'r.reverts_id',
      'u.id as author_id',
      'u.display_name as author_name',
    ])
    .where('r.project_id', '=', projectId)
    .orderBy('r.id', 'desc')
    .limit(limit)
    .execute();
}

export async function getRoadmapRevisionById(
  k: Kdb,
  projectId: number,
  revisionId: number,
): Promise<RevisionWithRoadmap | undefined> {
  const row = await k
    .selectFrom('roadmap_revisions as r')
    .innerJoin('users as u', 'u.id', 'r.author_id')
    .select([
      'r.id',
      'r.parent_id',
      'r.data_json',
      'r.message',
      'r.created_at',
      'r.reverts_id',
      'u.id as author_id',
      'u.display_name as author_name',
    ])
    .where('r.project_id', '=', projectId)
    .where('r.id', '=', revisionId)
    .executeTakeFirst();
  return row ?? undefined;
}

export interface InsertRoadmapRevisionInput {
  readonly projectId: number;
  readonly parentId: number | null;
  readonly dataJson: string;
  readonly authorId: number;
  readonly message: string;
}

export async function insertRoadmapRevision(
  k: Kdb,
  input: InsertRoadmapRevisionInput,
): Promise<RevisionWithAuthor> {
  const inserted = await k
    .insertInto('roadmap_revisions')
    .values({
      project_id: input.projectId,
      parent_id: input.parentId,
      data_json: input.dataJson,
      author_id: input.authorId,
      message: input.message,
    })
    .returning(['id', 'parent_id', 'message', 'created_at', 'reverts_id', 'author_id'])
    .executeTakeFirstOrThrow();
  const author = await k
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', inserted.author_id)
    .executeTakeFirstOrThrow();
  return { ...inserted, author_name: author.display_name };
}
