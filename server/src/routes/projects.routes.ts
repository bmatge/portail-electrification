import { Router } from 'express';
import type { Db } from '../db/client.js';
import { makeProjectsController } from '../controllers/projects.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { CreateProjectBodySchema, ImportProjectBodySchema } from '../schemas/project.schemas.js';

export function makeProjectsRouter(db: Db): Router {
  const router = Router();
  const ctrl = makeProjectsController(db);

  router.get('/projects', ctrl.list);
  // /!\ doit être déclaré AVANT la route `/projects/:slug` pour éviter que
  // "import" soit interprété comme un slug.
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
