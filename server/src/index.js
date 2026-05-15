import express from 'express';
import cookieParser from 'cookie-parser';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import './db.js';
import { attachUser, identifyRoute, logoutRoute, meRoute } from './auth.js';
import { projectsRouter, loadProject } from './routes/projects.js';
import { treeRouter } from './routes/tree.js';
import { historyRouter } from './routes/history.js';
import { commentsRouter } from './routes/comments.js';
import { roadmapRouter } from './routes/roadmap.js';
import { dataRouter } from './routes/data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.PUBLIC_DIR || resolve(__dirname, '../../');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser);

// ---- API ----------------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/identify', identifyRoute);
app.post('/api/logout', logoutRoute);
app.get('/api/me', meRoute);

// Liste/création/lecture des projets
app.use('/api', projectsRouter);

// Routes scoped par projet : /api/projects/:slug/{tree,history,roadmap,comments,data,...}
const scoped = express.Router({ mergeParams: true });
scoped.use(loadProject);
scoped.use(treeRouter);
scoped.use(historyRouter);
scoped.use(commentsRouter);
scoped.use(roadmapRouter);
scoped.use(dataRouter);
app.use('/api/projects/:slug', scoped);

// ---- Pages statiques ----------------------------------------------------

// Assets servis tels quels.
app.use('/assets', express.static(resolve(PUBLIC_DIR, 'assets')));

// Liste des pages valides à l'intérieur d'un projet (mappées vers les fichiers .html).
const PAGES = new Set([
  'objectifs',
  'arborescence',
  'maquette',
  'roadmap',
  'mesures',
  'dispositifs',
  'structure-drupal',
]);

// /p/:slug → /p/:slug/objectifs
app.get('/p/:slug', (req, res) => res.redirect(`/p/${encodeURIComponent(req.params.slug)}/objectifs`));

// /p/:slug/{page} → sert {page}.html
app.get('/p/:slug/:page', (req, res, next) => {
  const page = req.params.page;
  if (!PAGES.has(page)) return next();
  res.sendFile(resolve(PUBLIC_DIR, `${page}.html`));
});

// Racine = sélecteur de projet (index.html).
app.get('/', (_req, res) => res.sendFile(resolve(PUBLIC_DIR, 'index.html')));

// Fallback pour servir tout autre fichier statique exposé à la racine
// (favicon, .well-known, etc.) sans ré-exposer les .html déjà routés.
app.use(express.static(PUBLIC_DIR, { index: false, extensions: ['html'] }));

// ---- Erreurs ------------------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT} (public: ${PUBLIC_DIR})`);
});
