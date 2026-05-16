import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeTreeController } from '../controllers/tree.controller.js';
import { authorize } from '../middleware/authorize.js';
import { requireRead } from '../middleware/require-read.js';
import { validateBody } from '../middleware/validate.js';
import { SaveTreeBodySchema } from '../schemas/tree.schemas.js';

export function makeTreeRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeTreeController(k);
  router.get('/tree', requireRead('tree:read'), ctrl.read);
  router.put('/tree', authorize('tree:write'), validateBody(SaveTreeBodySchema), ctrl.write);
  return router;
}
