import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeHistoryController } from '../controllers/history.controller.js';
import { authorize } from '../middleware/authorize.js';
import { requireRead } from '../middleware/require-read.js';
import { validateBody } from '../middleware/validate.js';
import { RevertBodySchema } from '../schemas/data.schemas.js';

export function makeHistoryRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeHistoryController(k);
  router.get('/history', requireRead('tree:read'), ctrl.list);
  router.get('/revisions/:id', requireRead('tree:read'), ctrl.show);
  router.post(
    '/revisions/:id/revert',
    authorize('tree:revert'),
    validateBody(RevertBodySchema),
    ctrl.revert,
  );
  return router;
}
