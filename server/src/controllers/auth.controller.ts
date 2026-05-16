import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { AppError, UnauthorizedError } from '../domain/errors.js';
import { consumeCallback, logoutAll, logoutOne, requestLogin } from '../services/auth.service.js';
import { logAudit } from '../services/audit.service.js';
import type { Mailer } from '../services/mailer.service.js';
import { SESSION_COOKIE_NAME } from '../middleware/attach-user.js';
import { asyncH } from '../middleware/async-handler.js';
import { CallbackQuerySchema, MagicLinkRequestSchema } from '../schemas/auth.schemas.js';

const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function cookieOpts(req: Request): {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
  secure: boolean;
} {
  const forwarded = req.get('x-forwarded-proto');
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
    secure: req.protocol === 'https' || forwarded === 'https',
  };
}

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
function clientUA(req: Request): string | null {
  return req.get('user-agent') ?? null;
}
function publicBaseUrl(req: Request): string {
  const env = process.env['PUBLIC_BASE_URL'];
  if (env && env.length > 0) return env.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  const host = req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost';
  return `${proto}://${host}`;
}

export interface MakeAuthControllerOptions {
  readonly k: Kdb;
  readonly mailer: Mailer;
}

export function makeAuthController(opts: MakeAuthControllerOptions): {
  requestMagicLink: RequestHandler;
  callback: RequestHandler;
  logout: RequestHandler;
  logoutAll: RequestHandler;
  me: RequestHandler;
} {
  return {
    requestMagicLink: asyncH(async (req, res) => {
      // Validation explicite ici (sans validateBody) pour pouvoir réponde
      // 204 même si l'email est invalide (anti-énumération minimal).
      const parsed = MagicLinkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(204).end();
        return;
      }
      try {
        await requestLogin(opts.k, opts.mailer, {
          email: parsed.data.email,
          baseUrl: publicBaseUrl(req),
          ip: clientIp(req),
          userAgent: clientUA(req),
        });
      } catch (err) {
        if (err instanceof AppError && err.status === 429) throw err;
        // Autres erreurs : on swallow pour ne pas révéler d'info
        // (anti-énumération). L'audit reste muet ici.
      }
      res.status(204).end();
    }),
    callback: asyncH(async (req, res) => {
      const parsed = CallbackQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new AppError(400, 'validation_error', 'invalid_token');
      const result = await consumeCallback(opts.k, {
        token: parsed.data.token,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.cookie(SESSION_COOKIE_NAME, result.token, cookieOpts(req));
      // Redirection 303 vers / pour terminer le flow magic link OU réponse
      // JSON si Accept: application/json (utile pour la SPA et les tests).
      if ((req.get('accept') ?? '').includes('application/json')) {
        res.json({ user_id: result.userId, expires_at: result.expiresAt, created: result.created });
        return;
      }
      res.redirect(303, '/');
    }),
    logout: asyncH(async (req, res) => {
      const sessionId = req.sessionId;
      await logoutOne(opts.k, sessionId);
      await logAudit(opts.k, 'auth.logout', {
        actorId: req.user?.id ?? null,
        resourceType: 'session',
        resourceId: sessionId ?? null,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(204).end();
    }),
    logoutAll: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      await logoutAll(opts.k, req.user.id);
      await logAudit(opts.k, 'auth.logout', {
        actorId: req.user.id,
        resourceType: 'session',
        resourceId: 'all',
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(204).end();
    }),
    me(req, res, next) {
      if (!req.user) {
        next(new UnauthorizedError());
        return;
      }
      res.json({
        user: {
          id: req.user.id,
          display_name: req.user.display_name,
          email: req.user.email,
          status: req.user.status,
          roles: req.user.roles,
        },
      });
    },
  };
}
