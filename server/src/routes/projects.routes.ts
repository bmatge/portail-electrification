import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeProjectsController } from '../controllers/projects.controller.js';
import { authorize } from '../middleware/authorize.js';
import { makeLoadProject } from '../middleware/load-project.js';
import { requireRead } from '../middleware/require-read.js';
import { validateBody } from '../middleware/validate.js';
import {
  CreateProjectBodySchema,
  ImportProjectBodySchema,
  UpdateProjectBodySchema,
} from '../schemas/project.schemas.js';

export function makeProjectsRouter(k: Kdb): Router {
  const router = Router();
  const ctrl = makeProjectsController(k);
  const loadProject = makeLoadProject(k);

  // Liste : pas de middleware d'auth (le service filtre selon le viewer).
  router.get('/projects', ctrl.list);
  // /!\ déclaré AVANT /projects/:slug pour éviter "import" interprété comme slug.
  router.post(
    '/projects/import',
    authorize('project:import', 'global'),
    validateBody(ImportProjectBodySchema),
    ctrl.importBundle,
  );
  // Détail projet : public si is_public, sinon project:read (un grant projet
  // ou global suffit).
  router.get('/projects/:slug', loadProject, requireRead('project:read'), ctrl.show);
  router.patch(
    '/projects/:slug',
    loadProject,
    authorize('project:update'),
    validateBody(UpdateProjectBodySchema),
    ctrl.update,
  );
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
