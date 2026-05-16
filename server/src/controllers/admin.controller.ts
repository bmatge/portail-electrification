import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { UnauthorizedError, ValidationError } from '../domain/errors.js';
import { asyncH } from '../middleware/async-handler.js';
import {
  disableUser,
  enableUser,
  grantRoleToUser,
  listUsersWithRoles,
  readAuditLog,
  revokeRoleFromUser,
} from '../services/admin.service.js';
import { AuditQuerySchema, GrantRoleBodySchema } from '../schemas/admin.schemas.js';

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
function clientUA(req: Request): string | null {
  return req.get('user-agent') ?? null;
}
function userIdParam(req: Request): number {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('invalid_id');
  return id;
}

export function makeAdminController(k: Kdb): {
  listUsers: RequestHandler;
  disable: RequestHandler;
  enable: RequestHandler;
  grant: RequestHandler;
  revoke: RequestHandler;
  audit: RequestHandler;
} {
  return {
    listUsers: asyncH(async (_req, res) => {
      res.json({ users: await listUsersWithRoles(k) });
    }),
    disable: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      await disableUser(k, {
        userId: userIdParam(req),
        actorId: req.user.id,
        ip: clientIp(req) ?? undefined,
        userAgent: clientUA(req) ?? undefined,
      });
      res.status(204).end();
    }),
    enable: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      await enableUser(k, {
        userId: userIdParam(req),
        actorId: req.user.id,
        ip: clientIp(req) ?? undefined,
        userAgent: clientUA(req) ?? undefined,
      });
      res.status(204).end();
    }),
    grant: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      const parsed = GrantRoleBodySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('validation_error', 'invalid body');
      await grantRoleToUser(k, {
        targetUserId: userIdParam(req),
        role: parsed.data.role,
        projectId: parsed.data.project_id ?? null,
        actorId: req.user.id,
        ip: clientIp(req) ?? undefined,
        userAgent: clientUA(req) ?? undefined,
      });
      res.status(204).end();
    }),
    revoke: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      const parsed = GrantRoleBodySchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('validation_error', 'invalid body');
      await revokeRoleFromUser(k, {
        targetUserId: userIdParam(req),
        role: parsed.data.role,
        projectId: parsed.data.project_id ?? null,
        actorId: req.user.id,
        ip: clientIp(req) ?? undefined,
        userAgent: clientUA(req) ?? undefined,
      });
      res.status(204).end();
    }),
    audit: asyncH(async (req, res) => {
      const parsed = AuditQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('validation_error', 'invalid query');
      const entries = await readAuditLog(k, {
        ...(parsed.data.action ? { action: parsed.data.action } : {}),
        ...(parsed.data.project_id !== undefined ? { projectId: parsed.data.project_id } : {}),
        ...(parsed.data.actor_id !== undefined ? { actorId: parsed.data.actor_id } : {}),
        ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
        ...(parsed.data.before !== undefined ? { before: parsed.data.before } : {}),
      });
      res.json({ entries });
    }),
  };
}
