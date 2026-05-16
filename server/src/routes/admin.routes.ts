import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeAdminController } from '../controllers/admin.controller.js';
import { authorize } from '../middleware/authorize.js';

export function makeAdminRouter(k: Kdb): Router {
  const router = Router();
  const ctrl = makeAdminController(k);
  router.get('/admin/users', authorize('users:read', 'global'), ctrl.listUsers);
  router.post('/admin/users/:id/disable', authorize('users:disable', 'global'), ctrl.disable);
  router.post('/admin/users/:id/enable', authorize('users:disable', 'global'), ctrl.enable);
  router.post('/admin/users/:id/roles', authorize('roles:grant', 'global'), ctrl.grant);
  router.delete('/admin/users/:id/roles', authorize('roles:revoke', 'global'), ctrl.revoke);
  router.get('/admin/audit-log', authorize('audit:read', 'global'), ctrl.audit);
  return router;
}
