// `requireRead(permission)` — middleware de lecture sur une ressource scopée
// projet. Si `req.project.is_public === true`, l'accès est autorisé sans
// authentification. Sinon, délègue à `authorize(permission)` (rejette 401
// si pas d'user, 403 si user sans permission). Utilisé pour les GET de
// tree / roadmap / data / comments / history.
//
// Les écritures restent toutes protégées par `authorize('*:write')`.

import type { RequestHandler } from 'express';
import { authorize } from './authorize.js';
import type { Permission } from '../services/rbac.service.js';

export function requireRead(permission: Permission): RequestHandler {
  const fallback = authorize(permission);
  return (req, res, next) => {
    if (req.project?.is_public === true) {
      next();
      return;
    }
    fallback(req, res, next);
  };
}
