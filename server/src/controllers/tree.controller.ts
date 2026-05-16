import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { getCurrentTree, saveTree } from '../services/tree.service.js';
import type { SaveTreeBody } from '../schemas/tree.schemas.js';

export function makeTreeController(db: Db): {
  read: RequestHandler;
  write: RequestHandler;
} {
  return {
    read(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      try {
        res.json(getCurrentTree(db, req.project.id));
      } catch (e) {
        next(e);
      }
    },
    write(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      if (!req.project) return next(new Error('project missing'));
      const body = req.body as SaveTreeBody;
      const expectedParent = req.get('If-Match');
      try {
        const result = saveTree(db, {
          projectId: req.project.id,
          tree: body.tree as { id: string } & Record<string, unknown>,
          message: body.message,
          authorId: req.user.id,
          authorName: req.user.name,
          expectedParent,
        });
        res.json(result);
      } catch (e) {
        next(e);
      }
    },
  };
}
