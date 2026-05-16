import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import {
  createComment,
  deleteComment,
  getCountsForProject,
  listForNode,
} from '../services/comment.service.js';
import type { CreateCommentBody } from '../schemas/comment.schemas.js';

export function makeCommentsController(db: Db): {
  listOrCount: RequestHandler;
  create: RequestHandler;
  remove: RequestHandler;
} {
  return {
    listOrCount(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      const nodeId = String(req.query['node_id'] ?? '');
      if (!nodeId) {
        res.json({ counts: getCountsForProject(db, req.project.id) });
        return;
      }
      res.json({ comments: listForNode(db, req.project.id, nodeId) });
    },
    create(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      if (!req.project) return next(new Error('project missing'));
      const body = req.body as CreateCommentBody;
      try {
        res.status(201).json({
          comment: createComment(db, {
            projectId: req.project.id,
            nodeId: body.node_id,
            body: body.body,
            authorId: req.user.id,
            authorName: req.user.name,
          }),
        });
      } catch (e) {
        next(e);
      }
    },
    remove(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      if (!req.project) return next(new Error('project missing'));
      try {
        deleteComment(db, req.project.id, Number(req.params['id']), req.user.id);
        res.status(204).end();
      } catch (e) {
        next(e);
      }
    },
  };
}
