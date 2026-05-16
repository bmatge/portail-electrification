import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeCommentsController } from '../controllers/comments.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { CreateCommentBodySchema } from '../schemas/comment.schemas.js';

export function makeCommentsRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeCommentsController(k);
  router.get('/comments', authorize('comments:read'), ctrl.listOrCount);
  router.post(
    '/comments',
    authorize('comments:create'),
    validateBody(CreateCommentBodySchema),
    ctrl.create,
  );
  // Middleware exige :delete:own ; le service vérifie ownership ou :delete:any.
  router.delete('/comments/:id', authorize('comments:delete:own'), ctrl.remove);
  return router;
}
