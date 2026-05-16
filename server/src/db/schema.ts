// Interface Database de Kysely : décrit la forme des rows de chaque table
// telle que SQLite la stocke. Source de vérité TS pour toutes les requêtes.
//
// Convention Kysely : utilise `Generated<T>` pour les colonnes auto-générées
// (PK auto-increment, défauts `datetime('now')`). Le type *sélectionné* reste
// `T` (sans flag), le type *inséré* devient optionnel.

import type { Generated } from 'kysely';

export interface UsersTable {
  id: Generated<number>;
  display_name: string;
  email: string | null;
  status: Generated<'active' | 'disabled' | 'pending'>;
  locale: Generated<string>;
  last_login_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SessionsTable {
  id: Generated<number>;
  token_hash: string;
  user_id: number;
  ip: string | null;
  user_agent: string | null;
  previous_id: number | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: Generated<string>;
  last_seen_at: Generated<string>;
}

export interface AuthIdentitiesTable {
  user_id: number;
  provider: 'local' | 'proconnect';
  provider_subject: string;
  provider_data: string | null;
  email_verified: Generated<number>;
  created_at: Generated<string>;
  last_used_at: string | null;
}

export interface MagicLinkTokensTable {
  token_hash: string;
  email: string;
  user_id: number | null;
  requested_ip: string | null;
  user_agent: string | null;
  expires_at: string;
  used_at: string | null;
  consumed_by_session_id: number | null;
  created_at: Generated<string>;
}

export interface UserRolesTable {
  id: Generated<number>;
  user_id: number;
  project_id: number | null;
  role: 'admin' | 'editor' | 'viewer';
  granted_by: number | null;
  granted_at: Generated<string>;
}

export interface ProjectsTable {
  id: Generated<number>;
  slug: string;
  name: string;
  description: Generated<string>;
  created_at: Generated<string>;
  created_by: number | null;
  is_public: Generated<number>;
}

export interface ProjectDataTable {
  project_id: number;
  key: string;
  json_value: string;
  updated_at: Generated<string>;
  updated_by: number | null;
}

export interface RevisionsTable {
  id: Generated<number>;
  parent_id: number | null;
  tree_json: string;
  author_id: number;
  message: Generated<string>;
  reverts_id: number | null;
  created_at: Generated<string>;
  project_id: Generated<number>;
}

export interface RoadmapRevisionsTable {
  id: Generated<number>;
  parent_id: number | null;
  data_json: string;
  author_id: number;
  message: Generated<string>;
  reverts_id: number | null;
  created_at: Generated<string>;
  project_id: Generated<number>;
}

export interface CommentsTable {
  id: Generated<number>;
  node_id: string;
  author_id: number;
  body: string;
  revision_id: number | null;
  created_at: Generated<string>;
  deleted_at: string | null;
  project_id: Generated<number>;
}

export interface SchemaMigrationsTable {
  name: string;
  applied_at: Generated<string>;
}

export interface AuditLogTable {
  id: Generated<number>;
  actor_id: number | null;
  action: string;
  project_id: number | null;
  resource_type: string | null;
  resource_id: string | null;
  details: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<string>;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  auth_identities: AuthIdentitiesTable;
  magic_link_tokens: MagicLinkTokensTable;
  user_roles: UserRolesTable;
  projects: ProjectsTable;
  project_data: ProjectDataTable;
  revisions: RevisionsTable;
  roadmap_revisions: RoadmapRevisionsTable;
  comments: CommentsTable;
  schema_migrations: SchemaMigrationsTable;
  audit_log: AuditLogTable;
}
