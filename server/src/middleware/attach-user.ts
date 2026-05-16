import type { RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { findSessionByToken, touchSession } from '../repositories/session.repo.js';

const COOKIE = 'pe_session';

export function makeAttachUser(k: Kdb): RequestHandler {
  return (req, _res, next) => {
    const token: string | undefined = req.cookies?.[COOKIE];
    if (!token) {
      next();
      return;
    }
    findSessionByToken(k, token)
      .then(async (sess) => {
        if (sess) {
          await touchSession(k, token);
          req.user = { id: sess.user_id, name: sess.user_name };
          req.sessionToken = token;
        }
        next();
      })
      .catch(next);
  };
}

export const SESSION_COOKIE_NAME = COOKIE;
