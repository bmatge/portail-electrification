import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { readProjectData, writeProjectData } from '../services/data.service.js';
import type { WriteProjectDataBody } from '../schemas/data.schemas.js';

export function makeDataController(db: Db): {
  read: RequestHandler;
  write: RequestHandler;
} {
  return {
    read(req, res, next) {
      if (!req.project) return next(new Error('project missing'));
      try {
        res.json(readProjectData(db, req.project.id, String(req.params['key'] ?? '')));
      } catch (e) {
        next(e);
      }
    },
    write(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      if (!req.project) return next(new Error('project missing'));
      const body = req.body as WriteProjectDataBody;
      try {
        writeProjectData(
          db,
          req.project.id,
          String(req.params['key'] ?? ''),
          body.data,
          req.user.id,
        );
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  };
}
