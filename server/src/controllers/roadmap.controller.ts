import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import {
  getCurrentRoadmap,
  getRoadmapRevision,
  listRoadmapHistory,
  saveRoadmap,
} from '../services/roadmap.service.js';
import type { SaveRoadmapBody } from '../schemas/roadmap.schemas.js';

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  return Math.min(Number.isFinite(n) && n > 0 ? n : 100, 500);
}

export function makeRoadmapController(db: Db): {
  read: RequestHandler;
  write: RequestHandler;
  history: RequestHandler;
  showRevision: RequestHandler;
} {
  return {
    read(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      try {
        res.json(getCurrentRoadmap(db, req.project.id));
      } catch (e) {
        next(e);
      }
    },
    write(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      if (!req.project) return next(new Error('project missing'));
      const body = req.body as SaveRoadmapBody;
      const expectedParent = req.get('If-Match');
      try {
        res.json(
          saveRoadmap(db, {
            projectId: req.project.id,
            roadmap: body.roadmap as { items: readonly unknown[] } & Record<string, unknown>,
            message: body.message,
            authorId: req.user.id,
            authorName: req.user.name,
            expectedParent,
          }),
        );
      } catch (e) {
        next(e);
      }
    },
    history(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      res.json(listRoadmapHistory(db, req.project.id, parseLimit(req.query['limit'])));
    },
    showRevision(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      try {
        res.json(getRoadmapRevision(db, req.project.id, Number(req.params['id'])));
      } catch (e) {
        next(e);
      }
    },
  };
}
