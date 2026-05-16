import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import {
  createComment,
  deleteComment,
  getCountsForProject,
  listForNode,
} from '../services/comment.service.js';
import { asyncH } from '../middleware/async-handler.js';
import type { CreateCommentBody } from '../schemas/comment.schemas.js';

function clientIp(req: Request): string {
  return req.ip ?? '';
}
function clientUA(req: Request): string {
  return req.get('user-agent') ?? '';
}

export function makeCommentsController(k: Kdb): {
  listOrCount: RequestHandler;
  create: RequestHandler;
  remove: RequestHandler;
} {
  return {
    listOrCount: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      const nodeId = String(req.query['node_id'] ?? '');
      if (!nodeId) {
        res.json({ counts: await getCountsForProject(k, req.project.id) });
        return;
      }
      res.json({ comments: await listForNode(k, req.project.id, nodeId) });
    }),
    create: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      if (!req.project) throw new Error('project missing');
      const body = req.body as CreateCommentBody;
      res.status(201).json({
        comment: await createComment(k, {
          projectId: req.project.id,
          nodeId: body.node_id,
          body: body.body,
          authorId: req.user.id,
          authorName: req.user.display_name,
          ip: clientIp(req),
          userAgent: clientUA(req),
        }),
      });
    }),
    remove: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      if (!req.project) throw new Error('project missing');
      await deleteComment(k, {
        projectId: req.project.id,
        commentId: Number(req.params['id']),
        actorId: req.user.id,
        actorGrants: req.user.roles,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.status(204).end();
    }),
  };
}
