import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeAuthController } from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.js';
import { IdentifyBodySchema } from '../schemas/auth.schemas.js';

export function makeAuthRouter(k: Kdb): Router {
  const router = Router();
  const ctrl = makeAuthController(k);
  router.post('/identify', validateBody(IdentifyBodySchema), ctrl.identifyHandler);
  router.post('/logout', ctrl.logoutHandler);
  router.get('/me', ctrl.meHandler);
  return router;
}
