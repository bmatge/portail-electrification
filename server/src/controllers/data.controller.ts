import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { readProjectData, writeProjectData } from '../services/data.service.js';
import { asyncH } from '../middleware/async-handler.js';
import type { WriteProjectDataBody } from '../schemas/data.schemas.js';

function clientIp(req: Request): string {
  return req.ip ?? '';
}
function clientUA(req: Request): string {
  return req.get('user-agent') ?? '';
}

export function makeDataController(k: Kdb): {
  read: RequestHandler;
  write: RequestHandler;
} {
  return {
    read: asyncH(async (req, res) => {
      if (!req.project) throw new Error('project missing');
      res.json(await readProjectData(k, req.project.id, String(req.params['key'] ?? '')));
    }),
    write: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      if (!req.project) throw new Error('project missing');
      const body = req.body as WriteProjectDataBody;
      await writeProjectData(k, {
        projectId: req.project.id,
        key: String(req.params['key'] ?? ''),
        data: body.data,
        actorId: req.user.id,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.json({ ok: true });
    }),
  };
}
