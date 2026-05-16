// Middleware sécurité Express : helmet + rate-limit (3 buckets : auth/write/
// read). Activé par défaut en createApp ; les tests désactivent rate-limit
// pour ne pas casser les batchs de tests rapides.

import helmet, { type HelmetOptions } from 'helmet';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export function makeHelmet(): RequestHandler {
  // Politique conservatrice : on garde les defaults helmet v8 (CSP solide,
  // HSTS, X-Content-Type-Options, etc.) en relaxant `script-src` et
  // `style-src` pour laisser passer le DSFR (le bundling local + nonce est
  // un chantier ultérieur). Pas d'overhead inutile sur les écritures.
  const opts: HelmetOptions = {
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };
  return helmet(opts);
}

export interface RateLimitBuckets {
  readonly auth: RateLimitRequestHandler;
  readonly write: RateLimitRequestHandler;
  readonly read: RateLimitRequestHandler;
}

export function makeRateLimits(): RateLimitBuckets {
  const common = { standardHeaders: true, legacyHeaders: false };
  return {
    // 10 req/min/IP sur /api/auth/* (anti-bruteforce magic link)
    auth: rateLimit({ ...common, windowMs: 60 * 1000, max: 10 }),
    // 60 mutations/min/IP (POST/PUT/DELETE hors auth)
    write: rateLimit({ ...common, windowMs: 60 * 1000, max: 60 }),
    // 300 lectures/min/IP (GET)
    read: rateLimit({ ...common, windowMs: 60 * 1000, max: 300 }),
  };
}

// Sélectionne le bucket selon la méthode + le path.
export function makeRateLimitDispatcher(buckets: RateLimitBuckets): RequestHandler {
  return (req, res, next) => {
    if (req.path.startsWith('/auth/')) {
      buckets.auth(req, res, next);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      buckets.read(req, res, next);
      return;
    }
    buckets.write(req, res, next);
  };
}
