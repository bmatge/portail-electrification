import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeTreeController } from '../controllers/tree.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { SaveTreeBodySchema } from '../schemas/tree.schemas.js';

export function makeTreeRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeTreeController(k);
  router.get('/tree', ctrl.read);
  router.put('/tree', requireUser, validateBody(SaveTreeBodySchema), ctrl.write);
  return router;
}
