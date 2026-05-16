import { Router } from 'express';
import type { Db } from '../db/client.js';
import { makeAuthController } from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.js';
import { IdentifyBodySchema } from '../schemas/auth.schemas.js';

export function makeAuthRouter(db: Db): Router {
  const router = Router();
  const ctrl = makeAuthController(db);
  router.post('/identify', validateBody(IdentifyBodySchema), ctrl.identifyHandler);
  router.post('/logout', ctrl.logoutHandler);
  router.get('/me', ctrl.meHandler);
  return router;
}
