import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import type { Mailer } from '../services/mailer.service.js';
import { makeAuthController } from '../controllers/auth.controller.js';

export function makeAuthRouter(k: Kdb, mailer: Mailer): Router {
  const router = Router();
  const ctrl = makeAuthController({ k, mailer });
  router.post('/auth/magic-link', ctrl.requestMagicLink);
  router.get('/auth/callback', ctrl.callback);
  router.post('/auth/logout', ctrl.logout);
  router.post('/auth/logout-all', ctrl.logoutAll);
  router.get('/me', ctrl.me);
  return router;
}
