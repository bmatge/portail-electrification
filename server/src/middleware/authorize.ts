// `authorize(permission, scope?)` — middleware qui exige la permission donnée.
// - scope par défaut : 'project' (lit `req.project.id` posé par load-project)
// - scope: 'global' = pas de contrainte projet (permissions admin)
//
// Retourne 401 si pas authentifié, 403 si authentifié mais sans permission.

import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../domain/errors.js';
import { hasPermission, type Permission } from '../services/rbac.service.js';

export type AuthorizeScope = 'project' | 'global';

export function authorize(
  permission: Permission,
  scope: AuthorizeScope = 'project',
): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (req.user.status !== 'active') {
      next(new ForbiddenError());
      return;
    }
    const projectId = scope === 'project' ? (req.project?.id ?? null) : null;
    if (hasPermission(req.user.roles, permission, projectId)) {
      next();
      return;
    }
    next(new ForbiddenError());
  };
}
