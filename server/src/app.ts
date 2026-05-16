// Construit l'application Express sans la démarrer. Permet aux tests
// supertest de monter une app autour d'une DB `:memory:` sans appeler
// `listen()`.

import express, { type Express, Router } from 'express';
import cookieParser from 'cookie-parser';
import type { Kdb } from './db/client.js';
import { makeAttachUser } from './middleware/attach-user.js';
import { makeLoadProject } from './middleware/load-project.js';
import { errorHandler } from './middleware/error-handler.js';
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
  readonly publicDir?: string;
  readonly serveStatic?: boolean;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(makeAttachUser(options.k));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', makeAuthRouter(options.k));
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
