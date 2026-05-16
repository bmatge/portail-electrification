// Types métier partagés entre repositories, services et controllers.
// En Phase 1 ces types décrivent les rows tels que better-sqlite3 les renvoie.
// La Phase 2 introduira Kysely et un schéma de Database interface dérivé.

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

export interface RevisionRow {
  readonly id: number;
  readonly parent_id: number | null;
  readonly tree_json: string;
  readonly author_id: number;
  readonly author_name: string;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
}

export interface RoadmapRevisionRow {
  readonly id: number;
  readonly parent_id: number | null;
  readonly data_json: string;
  readonly author_id: number;
  readonly author_name: string;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
}

export interface RevisionMetaRow {
  readonly id: number;
  readonly parent_id: number | null;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
  readonly author_id: number;
  readonly author_name: string;
}

export interface CommentRow {
  readonly id: number;
  readonly node_id: string;
  readonly body: string;
  readonly created_at: string;
  readonly revision_id: number | null;
  readonly author_id: number;
  readonly author_name: string;
}

export interface CommentMinimalRow {
  readonly id: number;
  readonly project_id: number;
  readonly author_id: number;
}

export interface ProjectDataRow {
  readonly json_value: string;
  readonly updated_at: string;
}

export interface CommentCountRow {
  readonly node_id: string;
  readonly n: number;
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
