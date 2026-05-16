import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { getRevision, listHistory, revertRevision } from '../services/history.service.js';
import type { RevertBody } from '../schemas/data.schemas.js';

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  return Math.min(Number.isFinite(n) && n > 0 ? n : 100, 500);
}

export function makeHistoryController(db: Db): {
  list: RequestHandler;
  show: RequestHandler;
  revert: RequestHandler;
} {
  return {
    list(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      const limit = parseLimit(req.query['limit']);
      res.json(listHistory(db, req.project.id, limit));
    },
    show(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      try {
        res.json(getRevision(db, req.project.id, Number(req.params['id'])));
      } catch (e) {
        next(e);
      }
    },
    revert(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      if (!req.project) return next(new Error('project missing'));
      const body = (req.body as RevertBody | undefined) ?? { message: '' };
      try {
        res.json(
          revertRevision(
            db,
            req.project.id,
            Number(req.params['id']),
            body.message ?? '',
            req.user.id,
            req.user.name,
          ),
        );
      } catch (e) {
        next(e);
      }
    },
  };
}
