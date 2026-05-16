import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { UnauthorizedError } from '../domain/errors.js';
import { identify, logout } from '../services/auth.service.js';
import { SESSION_COOKIE_NAME } from '../middleware/attach-user.js';
import { asyncH } from '../middleware/async-handler.js';
import type { IdentifyBody } from '../schemas/auth.schemas.js';

const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365; // 1 an

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
    maxAge: COOKIE_MAX_AGE,
    secure: req.protocol === 'https' || forwarded === 'https',
  };
}

export function makeAuthController(k: Kdb): {
  identifyHandler: RequestHandler;
  logoutHandler: RequestHandler;
  meHandler: RequestHandler;
} {
  return {
    identifyHandler: asyncH(async (req, res) => {
      const body = req.body as IdentifyBody;
      const result = await identify(k, body.name);
      res.cookie(SESSION_COOKIE_NAME, result.token, cookieOpts(req));
      res.json({ user: result.user });
    }),
    logoutHandler: asyncH(async (req, res) => {
      await logout(k, req.sessionToken);
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(204).end();
    }),
    meHandler(req, res, next) {
      if (!req.user) {
        next(new UnauthorizedError());
        return;
      }
      res.json({ user: req.user });
    },
  };
}
