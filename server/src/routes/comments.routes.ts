import { Router } from 'express';
import type { Kdb } from '../db/client.js';
import { makeCommentsController } from '../controllers/comments.controller.js';
import { authorize } from '../middleware/authorize.js';
import { requireRead } from '../middleware/require-read.js';
import { validateBody } from '../middleware/validate.js';
import { CreateCommentBodySchema } from '../schemas/comment.schemas.js';

export function makeCommentsRouter(k: Kdb): Router {
  const router = Router({ mergeParams: true });
  const ctrl = makeCommentsController(k);
  // Lecture des commentaires : suit la visibilité du projet (publique si is_public).
  // Création : toujours protégée — pas de commentaire anonyme.
  router.get('/comments', requireRead('comments:read'), ctrl.listOrCount);
  router.post(
    '/comments',
    authorize('comments:create'),
    validateBody(CreateCommentBodySchema),
    ctrl.create,
  );
  router.delete('/comments/:id', authorize('comments:delete:own'), ctrl.remove);
  return router;
}
