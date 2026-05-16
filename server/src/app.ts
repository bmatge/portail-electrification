// Construit l'application Express sans la démarrer. Permet aux tests
// supertest de monter une app autour d'une DB `:memory:` sans appeler
// `listen()`.

import express, { type Express, Router } from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { Kdb } from './db/client.js';
import type { Mailer } from './services/mailer.service.js';
import { logger } from './logger.js';
import { makeAttachUser } from './middleware/attach-user.js';
import { makeLoadProject } from './middleware/load-project.js';
import { errorHandler } from './middleware/error-handler.js';
import { makeHelmet, makeRateLimits, makeRateLimitDispatcher } from './middleware/security.js';
import { makeAdminRouter } from './routes/admin.routes.js';
import { makeAuthRouter } from './routes/auth.routes.js';
import { makeProjectsRouter } from './routes/projects.routes.js';
import { makeTreeRouter } from './routes/tree.routes.js';
import { makeHistoryRouter } from './routes/history.routes.js';
import { makeRoadmapRouter } from './routes/roadmap.routes.js';
import { makeCommentsRouter } from './routes/comments.routes.js';
import { makeDataRouter } from './routes/data.routes.js';
import { makeStaticRouter } from './static.js';

export interface CreateAppOptions {
  readonly k: Kdb;
  readonly mailer: Mailer;
  readonly publicDir?: string;
  readonly serveStatic?: boolean;
  /** Active helmet + rate-limit + pino-http. Désactivé par défaut pour
   *  garder la suite de tests rapide et déterministe ; activé via
   *  NODE_ENV=production au boot. */
  readonly hardenForProd?: boolean;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  if (options.hardenForProd) {
    app.use(makeHelmet());
    app.use(
      pinoHttp({
        logger,
        genReqId: (req, res) => {
          const incoming = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
          res.setHeader('X-Request-Id', incoming);
          return incoming;
        },
      }),
    );
  }

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  if (options.hardenForProd) {
    const buckets = makeRateLimits();
    app.use('/api', makeRateLimitDispatcher(buckets));
  }

  app.use(makeAttachUser(options.k));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', makeAuthRouter(options.k, options.mailer));
  app.use('/api', makeAdminRouter(options.k));
  app.use('/api', makeProjectsRouter(options.k));

  const scoped = Router({ mergeParams: true });
  scoped.use(makeLoadProject(options.k));
  scoped.use(makeTreeRouter(options.k));
  scoped.use(makeHistoryRouter(options.k));
  scoped.use(makeRoadmapRouter(options.k));
  scoped.use(makeCommentsRouter(options.k));
  scoped.use(makeDataRouter(options.k));
  app.use('/api/projects/:slug', scoped);

  if (options.serveStatic !== false && options.publicDir) {
    app.use(makeStaticRouter(options.publicDir));
  }

  app.use(errorHandler);
  return app;
}
