import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeDataController } from '../controllers/data.controller.js';
import { authorize } from '../middleware/authorize.js';
import { requireRead } from '../middleware/require-read.js';
import { validateBody } from '../middleware/validate.js';
import { WriteProjectDataBodySchema } from '../schemas/data.schemas.js';

export function makeDataRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeDataController(k);
  router.get('/data/:key', requireRead('data:read'), ctrl.read);
  router.put(
    '/data/:key',
    authorize('data:write'),
    validateBody(WriteProjectDataBodySchema),
    ctrl.write,
  );
  return router;
}
