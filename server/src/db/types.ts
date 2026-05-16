// Types métier partagés entre services et controllers. Les types repository
// (rows brutes Kysely) sont définis dans `schema.ts`.

import type { Role } from '@latelier/shared';

export interface Project {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly created_at: string;
  readonly created_by: number | null;
}

export interface ProjectListItem extends Project {
  readonly revision_count: number;
}

export interface UserRow {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
}

export interface AuthenticatedUser {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
  readonly roles: readonly { readonly role: Role; readonly projectId: number | null }[];
}

export interface AuthorRef {
  readonly id: number;
  readonly name: string;
}

export interface RevisionSummary {
  readonly id: number;
  readonly parent_id: number | null;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
  readonly author: AuthorRef;
}

export interface RevisionWithAuthor {
  readonly id: number;
  readonly parent_id: number | null;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
  readonly author_id: number;
  readonly author_name: string;
}

export interface RevisionWithTree extends RevisionWithAuthor {
  readonly tree_json: string;
}

export interface RevisionWithRoadmap extends RevisionWithAuthor {
  readonly data_json: string;
}
