// Types métier partagés entre services et controllers. Les types repository
// (rows brutes Kysely) sont définis dans `schema.ts`.

export interface Project {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly created_at: string;
}

export interface ProjectListItem extends Project {
  readonly revision_count: number;
}

export interface UserRow {
  readonly id: number;
  readonly name: string;
}

export interface AuthenticatedUser {
  readonly id: number;
  readonly name: string;
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

// Forme dénormalisée des révisions tree/roadmap utilisée en interne.
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
