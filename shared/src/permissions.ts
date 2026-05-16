// RBAC en code (pas en DB). Partagé serveur + SPA Vue : le front peut cacher
// des boutons via `useAuth().hasPermission(...)`, mais l'autorité reste le
// middleware serveur (le client ne peut pas mentir au serveur, le serveur
// vérifie tout).

export const ROLES = ['admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

// Format `domain:action[:qualifier]` avec qualifier ∈ {own, any}.
// Les *:read sont implicites pour viewer (sinon viewer ne pourrait rien lire).
export const PERMISSIONS = [
  // projects
  'project:read',
  'project:create',
  'project:update',
  'project:export',
  'project:import',
  'project:delete:own',
  'project:delete:any',
  // tree
  'tree:read',
  'tree:write',
  'tree:revert',
  // roadmap
  'roadmap:read',
  'roadmap:write',
  'roadmap:revert',
  // data (catalogues per-projet)
  'data:read',
  'data:write',
  // comments
  'comments:read',
  'comments:create',
  'comments:delete:own',
  'comments:delete:any',
  // users (admin)
  'users:read',
  'users:invite',
  'users:disable',
  // roles (admin)
  'roles:grant',
  'roles:revoke',
  // audit (admin)
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADMIN: readonly Permission[] = PERMISSIONS;

const EDITOR: readonly Permission[] = [
  'project:read',
  'project:create',
  'project:update',
  'project:export',
  'project:import',
  'project:delete:own',
  'tree:read',
  'tree:write',
  'tree:revert',
  'roadmap:read',
  'roadmap:write',
  'roadmap:revert',
  'data:read',
  'data:write',
  'comments:read',
  'comments:create',
  'comments:delete:own',
];

const VIEWER: readonly Permission[] = [
  'project:read',
  'tree:read',
  'roadmap:read',
  'data:read',
  'comments:read',
  'comments:create',
  'comments:delete:own',
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  admin: ADMIN,
  editor: EDITOR,
  viewer: VIEWER,
};

export function rolePermissions(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

// Une "permission grant" représente un rôle attribué à un user, optionnellement
// scopé à un projet (project_id = null → grant global).
export interface RoleGrant {
  readonly role: Role;
  readonly projectId: number | null;
}

// Détermine si un ensemble de grants accorde une permission sur un projet
// donné. Les grants globales sont toujours appliquées ; les grants scopées
// project s'appliquent seulement si projectId matche.
//
// Les permissions :own sont accordées au niveau permission (`*:delete:own`),
// la vérification d'ownership reste à la charge du service appelant (un
// viewer ne peut PAS supprimer le commentaire d'autrui même avec own).
export function hasPermission(
  grants: readonly RoleGrant[],
  permission: Permission,
  projectId: number | null = null,
): boolean {
  for (const grant of grants) {
    if (grant.projectId !== null && grant.projectId !== projectId) continue;
    if (rolePermissions(grant.role).includes(permission)) return true;
  }
  return false;
}
