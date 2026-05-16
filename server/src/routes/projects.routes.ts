import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeProjectsController } from '../controllers/projects.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { CreateProjectBodySchema, ImportProjectBodySchema } from '../schemas/project.schemas.js';

export function makeProjectsRouter(k: Kdb): Router {
  const router = Router();
  const ctrl = makeProjectsController(k);

  router.get('/projects', authorize('project:read', 'global'), ctrl.list);
  // /!\ déclaré AVANT /projects/:slug pour éviter "import" interprété comme slug.
  router.post(
    '/projects/import',
    authorize('project:import', 'global'),
    validateBody(ImportProjectBodySchema),
    ctrl.importBundle,
  );
  router.get('/projects/:slug', authorize('project:read', 'global'), ctrl.show);
  // Le middleware vérifie au minimum :delete:own ; le service compare
  // projects.created_by avec req.user.id et accepte aussi :delete:any (admin).
  router.delete('/projects/:slug', authorize('project:delete:own', 'global'), ctrl.remove);
  router.get('/projects/:slug/export', authorize('project:export', 'global'), ctrl.exportBundle);
  router.post(
    '/projects',
    authorize('project:create', 'global'),
    validateBody(CreateProjectBodySchema),
    ctrl.create,
  );
  return router;
}
