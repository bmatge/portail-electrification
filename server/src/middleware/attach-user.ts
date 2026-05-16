import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { findSessionByToken, touchSession } from '../repositories/session.repo.js';

const COOKIE = 'pe_session';

export function makeAttachUser(db: Db): RequestHandler {
  return (req, _res, next) => {
    const token: string | undefined = req.cookies?.[COOKIE];
    if (token) {
      const sess = findSessionByToken(db, token);
      if (sess) {
        touchSession(db, token);
        req.user = { id: sess.user_id, name: sess.user_name };
        req.sessionToken = token;
      }
    }
    next();
  };
}

export const SESSION_COOKIE_NAME = COOKIE;
