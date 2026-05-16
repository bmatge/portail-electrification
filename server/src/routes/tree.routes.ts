import { Router } from 'express';
import type { Db } from '../db/client.js';
import { makeTreeController } from '../controllers/tree.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { SaveTreeBodySchema } from '../schemas/tree.schemas.js';

export function makeTreeRouter(db: Db): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeTreeController(db);
  router.get('/tree', ctrl.read);
  router.put('/tree', requireUser, validateBody(SaveTreeBodySchema), ctrl.write);
  return router;
}
