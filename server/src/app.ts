// Construit l'application Express sans la démarrer. Permet aux tests
// supertest de monter une app autour d'une DB `:memory:` sans appeler
// `listen()`.

import express, { type Express, Router } from 'express';
import cookieParser from 'cookie-parser';
import type { Db } from './db/client.js';
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
  readonly db: Db;
  readonly publicDir?: string;
  readonly serveStatic?: boolean;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(makeAttachUser(options.db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', makeAuthRouter(options.db));
  app.use('/api', makeProjectsRouter(options.db));

  const scoped = Router({ mergeParams: true });
  scoped.use(makeLoadProject(options.db));
  scoped.use(makeTreeRouter(options.db));
  scoped.use(makeHistoryRouter(options.db));
  scoped.use(makeRoadmapRouter(options.db));
  scoped.use(makeCommentsRouter(options.db));
  scoped.use(makeDataRouter(options.db));
  app.use('/api/projects/:slug', scoped);

  if (options.serveStatic !== false && options.publicDir) {
    app.use(makeStaticRouter(options.publicDir));
  }

  app.use(errorHandler);
  return app;
}
