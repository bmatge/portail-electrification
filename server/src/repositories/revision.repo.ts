import type { Kdb } from '../db/client.js';
import type { RevisionWithAuthor, RevisionWithTree } from '../db/types.js';

export async function getHeadRevision(
  k: Kdb,
  projectId: number,
): Promise<RevisionWithTree | undefined> {
  const row = await k
    .selectFrom('revisions as r')
    .innerJoin('users as u', 'u.id', 'r.author_id')
    .select([
      'r.id',
      'r.parent_id',
      'r.tree_json',
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

export async function listRevisions(
  k: Kdb,
  projectId: number,
  limit: number,
): Promise<readonly RevisionWithAuthor[]> {
  return await k
    .selectFrom('revisions as r')
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

export async function getRevisionById(
  k: Kdb,
  projectId: number,
  revisionId: number,
): Promise<RevisionWithTree | undefined> {
  const row = await k
    .selectFrom('revisions as r')
    .innerJoin('users as u', 'u.id', 'r.author_id')
    .select([
      'r.id',
      'r.parent_id',
      'r.tree_json',
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

export interface InsertRevisionInput {
  readonly projectId: number;
  readonly parentId: number | null;
  readonly treeJson: string;
  readonly authorId: number;
  readonly message: string;
  readonly revertsId?: number | null;
}

export async function insertRevision(
  k: Kdb,
  input: InsertRevisionInput,
): Promise<RevisionWithAuthor> {
  const inserted = await k
    .insertInto('revisions')
    .values({
      project_id: input.projectId,
      parent_id: input.parentId,
      tree_json: input.treeJson,
      author_id: input.authorId,
      message: input.message,
      reverts_id: input.revertsId ?? null,
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
