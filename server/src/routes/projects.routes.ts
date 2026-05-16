import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeProjectsController } from '../controllers/projects.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { CreateProjectBodySchema, ImportProjectBodySchema } from '../schemas/project.schemas.js';

export function makeProjectsRouter(k: Kdb): Router {
  const router = Router();
  const ctrl = makeProjectsController(k);

  router.get('/projects', ctrl.list);
  // /!\ déclaré AVANT /projects/:slug pour éviter "import" interprété comme slug.
  router.post(
    '/projects/import',
    requireUser,
    validateBody(ImportProjectBodySchema),
    ctrl.importBundle,
  );
  router.get('/projects/:slug', ctrl.show);
  router.delete('/projects/:slug', requireUser, ctrl.remove);
  router.get('/projects/:slug/export', ctrl.exportBundle);
  router.post('/projects', requireUser, validateBody(CreateProjectBodySchema), ctrl.create);
  return router;
}
