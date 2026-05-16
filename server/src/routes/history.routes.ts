import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeHistoryController } from '../controllers/history.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { RevertBodySchema } from '../schemas/data.schemas.js';

export function makeHistoryRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeHistoryController(k);
  router.get('/history', ctrl.list);
  router.get('/revisions/:id', ctrl.show);
  router.post('/revisions/:id/revert', requireUser, validateBody(RevertBodySchema), ctrl.revert);
  return router;
}
