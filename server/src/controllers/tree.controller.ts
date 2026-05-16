import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { getCurrentTree, saveTree } from '../services/tree.service.js';
import { asyncH } from '../middleware/async-handler.js';
import type { SaveTreeBody } from '../schemas/tree.schemas.js';

function clientIp(req: Request): string {
  return req.ip ?? '';
}
function clientUA(req: Request): string {
  return req.get('user-agent') ?? '';
}

export function makeTreeController(k: Kdb): {
  read: RequestHandler;
  write: RequestHandler;
} {
  return {
    read: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      res.json(await getCurrentTree(k, req.project.id));
    }),
    write: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      if (!req.project) throw new Error('project missing');
      const body = req.body as SaveTreeBody;
      const expectedParent = req.get('If-Match');
      const result = await saveTree(k, {
        projectId: req.project.id,
        tree: body.tree as { id: string } & Record<string, unknown>,
        message: body.message,
        authorId: req.user.id,
        authorName: req.user.name,
        expectedParent,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.json(result);
    }),
  };
}
