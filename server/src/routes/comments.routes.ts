import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeCommentsController } from '../controllers/comments.controller.js';
import { requireUser } from '../middleware/require-user.js';
import { validateBody } from '../middleware/validate.js';
import { CreateCommentBodySchema } from '../schemas/comment.schemas.js';

export function makeCommentsRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeCommentsController(k);
  router.get('/comments', ctrl.listOrCount);
  router.post('/comments', requireUser, validateBody(CreateCommentBodySchema), ctrl.create);
  router.delete('/comments/:id', requireUser, ctrl.remove);
  return router;
}
