// Lit le cookie de session, vérifie en DB (sessions v2 : hash + active), et
// pose req.user + req.sessionId. Le rôle est résolu via loadGrantsForUser
// au moment du check d'autorisation (middleware authorize).

import type { RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { findActiveSessionByHash, touchSession } from '../repositories/session.repo.js';
import { hashSessionToken } from '../services/session.service.js';
import { loadGrantsForUser } from '../services/rbac.service.js';

const COOKIE = 'pe_session';

export function makeAttachUser(k: Kdb): RequestHandler {
  return (req, _res, next) => {
    const token: string | undefined = req.cookies?.[COOKIE];
    if (!token) {
      next();
      return;
    }
    findActiveSessionByHash(k, hashSessionToken(token))
      .then(async (sess) => {
        if (sess && sess.user_status === 'active') {
          await touchSession(k, sess.id);
          const grants = await loadGrantsForUser(k, sess.user_id);
          req.user = {
            id: sess.user_id,
            display_name: sess.user_display_name,
            email: sess.user_email,
            status: sess.user_status,
            roles: grants,
          };
          req.sessionId = sess.id;
          req.sessionToken = token;
        }
        next();
      })
      .catch(next);
  };
}

export const SESSION_COOKIE_NAME = COOKIE;
