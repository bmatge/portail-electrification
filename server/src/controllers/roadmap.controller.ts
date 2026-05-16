import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import {
  getCurrentRoadmap,
  getRoadmapRevision,
  listRoadmapHistory,
  saveRoadmap,
} from '../services/roadmap.service.js';
import { asyncH } from '../middleware/async-handler.js';
import type { SaveRoadmapBody } from '../schemas/roadmap.schemas.js';

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

export function makeRoadmapController(k: Kdb): {
  read: RequestHandler;
  write: RequestHandler;
  history: RequestHandler;
  showRevision: RequestHandler;
} {
  return {
    read: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      res.json(await getCurrentRoadmap(k, req.project.id));
    }),
    write: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      if (!req.project) throw new Error('project missing');
      const body = req.body as SaveRoadmapBody;
      const expectedParent = req.get('If-Match');
      res.json(
        await saveRoadmap(k, {
          projectId: req.project.id,
          roadmap: body.roadmap as { items: readonly unknown[] } & Record<string, unknown>,
          message: body.message,
          authorId: req.user.id,
          authorName: req.user.display_name,
          expectedParent,
          ip: clientIp(req),
          userAgent: clientUA(req),
        }),
      );
    }),
    history: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      res.json(await listRoadmapHistory(k, req.project.id, parseLimit(req.query['limit'])));
    }),
    showRevision: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      res.json(await getRoadmapRevision(k, req.project.id, Number(req.params['id'])));
    }),
  };
}
