import { Router } from 'express';
import type { Db } from '../db/client.js';
import { makeHistoryController } from '../controllers/history.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { RevertBodySchema } from '../schemas/data.schemas.js';

export function makeHistoryRouter(db: Db): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeHistoryController(db);
  router.get('/history', ctrl.list);
  router.get('/revisions/:id', ctrl.show);
  router.post('/revisions/:id/revert', requireUser, validateBody(RevertBodySchema), ctrl.revert);
  return router;
}
