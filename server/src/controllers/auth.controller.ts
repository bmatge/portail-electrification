import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { identify, logout } from '../services/auth.service.js';
import { SESSION_COOKIE_NAME } from '../middleware/attach-user.js';
import type { IdentifyBody } from '../schemas/auth.schemas.js';

const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365; // 1 an

function cookieOpts(req: Parameters<RequestHandler>[0]): {
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
    maxAge: COOKIE_MAX_AGE,
    secure: req.protocol === 'https' || forwarded === 'https',
  };
}

export function makeAuthController(db: Db): {
  identifyHandler: RequestHandler;
  logoutHandler: RequestHandler;
  meHandler: RequestHandler;
} {
  return {
    identifyHandler(req, res) {
      const body = req.body as IdentifyBody;
      const result = identify(db, body.name);
      res.cookie(SESSION_COOKIE_NAME, result.token, cookieOpts(req));
      res.json({ user: result.user });
    },
    logoutHandler(req, res) {
      logout(db, req.sessionToken);
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(204).end();
    },
    meHandler(req, res, next) {
      if (!req.user) {
        next(new UnauthorizedError());
        return;
      }
      res.json({ user: req.user });
    },
  };
}
