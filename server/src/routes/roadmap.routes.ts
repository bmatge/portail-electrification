import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeRoadmapController } from '../controllers/roadmap.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { SaveRoadmapBodySchema } from '../schemas/roadmap.schemas.js';

export function makeRoadmapRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeRoadmapController(k);
  router.get('/roadmap', authorize('roadmap:read'), ctrl.read);
  router.put(
    '/roadmap',
    authorize('roadmap:write'),
    validateBody(SaveRoadmapBodySchema),
    ctrl.write,
  );
  router.get('/roadmap/history', authorize('roadmap:read'), ctrl.history);
  router.get('/roadmap/revisions/:id', authorize('roadmap:read'), ctrl.showRevision);
  return router;
}
