import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeRoadmapController } from '../controllers/roadmap.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { SaveRoadmapBodySchema } from '../schemas/roadmap.schemas.js';

export function makeRoadmapRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeRoadmapController(k);
  router.get('/roadmap', ctrl.read);
  router.put('/roadmap', requireUser, validateBody(SaveRoadmapBodySchema), ctrl.write);
  router.get('/roadmap/history', ctrl.history);
  router.get('/roadmap/revisions/:id', ctrl.showRevision);
  return router;
}
