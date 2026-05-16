import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { getRevision, listHistory, revertRevision } from '../services/history.service.js';
import { asyncH } from '../middleware/async-handler.js';
import type { RevertBody } from '../schemas/data.schemas.js';

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  return Math.min(Number.isFinite(n) && n > 0 ? n : 100, 500);
}
function clientIp(req: Request): string {
  return req.ip ?? '';
}
function clientUA(req: Request): string {
  return req.get('user-agent') ?? '';
}

export function makeHistoryController(k: Kdb): {
  list: RequestHandler;
  show: RequestHandler;
  revert: RequestHandler;
} {
  return {
    list: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      const limit = parseLimit(req.query['limit']);
      res.json(await listHistory(k, req.project.id, limit));
    }),
    show: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      res.json(await getRevision(k, req.project.id, Number(req.params['id'])));
    }),
    revert: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      if (!req.project) throw new Error('project missing');
      const body = (req.body as RevertBody | undefined) ?? { message: '' };
      res.json(
        await revertRevision(k, {
          projectId: req.project.id,
          revisionId: Number(req.params['id']),
          message: body.message ?? '',
          authorId: req.user.id,
          authorName: req.user.display_name,
          ip: clientIp(req),
          userAgent: clientUA(req),
        }),
      );
    }),
  };
}
