import type { Db } from '../db/client.js';
import type { RevisionRow, RevisionSummary } from '../db/types.js';
import { getHeadRevision, insertRevision } from '../repositories/revision.repo.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';

export function serializeRevision(row: {
  readonly id: number;
  readonly parent_id: number | null;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
  readonly author_id: number;
  readonly author_name: string;
}): RevisionSummary {
  return {
    id: row.id,
    parent_id: row.parent_id,
    message: row.message,
    created_at: row.created_at,
    reverts_id: row.reverts_id,
    author: { id: row.author_id, name: row.author_name },
  };
}

export interface TreeHead {
  readonly revision: RevisionSummary;
  readonly tree: unknown;
}

export function getCurrentTree(db: Db, projectId: number): TreeHead {
  const head = getHeadRevision(db, projectId);
  if (!head) throw new NotFoundError('no_revision');
  return { revision: serializeRevision(head), tree: JSON.parse(head.tree_json) };
}

export interface SaveTreeInput {
  readonly projectId: number;
  readonly tree: { readonly id: string } & Record<string, unknown>;
  readonly message: string;
  readonly authorId: number;
  readonly authorName: string;
  readonly expectedParent: string | undefined;
}

export interface SaveTreeResult {
  readonly revision: RevisionSummary;
}

export function saveTree(db: Db, input: SaveTreeInput): SaveTreeResult {
  const head: RevisionRow | undefined = getHeadRevision(db, input.projectId);
  if (
    input.expectedParent !== undefined &&
    input.expectedParent !== '' &&
    head &&
    String(head.id) !== input.expectedParent
  ) {
    throw new ConflictError('conflict', 'tree head moved', serializeRevision(head));
  }

  const parentId = head ? head.id : null;
  const msg = input.message.slice(0, 200);
  const inserted = insertRevision(db, {
    projectId: input.projectId,
    parentId,
    treeJson: JSON.stringify(input.tree),
    authorId: input.authorId,
    message: msg,
  });
  return {
    revision: {
      id: inserted.id,
      parent_id: inserted.parent_id,
      message: inserted.message,
      created_at: inserted.created_at,
      reverts_id: inserted.reverts_id,
      author: { id: input.authorId, name: input.authorName },
    },
  };
}
