import { Router } from 'express';
import type { Db } from '../db/client.js';
import { makeDataController } from '../controllers/data.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { WriteProjectDataBodySchema } from '../schemas/data.schemas.js';

export function makeDataRouter(db: Db): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeDataController(db);
  router.get('/data/:key', ctrl.read);
  router.put('/data/:key', requireUser, validateBody(WriteProjectDataBodySchema), ctrl.write);
  return router;
}
