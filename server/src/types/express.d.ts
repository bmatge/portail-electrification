// Augmentation du type Request d'Express pour porter le user authentifié,
// le token de session courant et le projet résolu via le middleware
// `load-project`. Tous les champs sont optionnels — un GET public n'a ni
// user ni projet ; un endpoint scopé garantit la présence de `req.project`.

import type { Project } from '../db/types.js';
import type { AuthenticatedUser } from '../db/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionToken?: string;
      sessionId?: number;
      project?: Project;
    }
  }
}

export {};
