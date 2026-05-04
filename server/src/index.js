import express from 'express';
import cookieParser from 'cookie-parser';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import './db.js';
import { attachUser, identifyRoute, logoutRoute, meRoute } from './auth.js';
import { treeRouter } from './routes/tree.js';
import { historyRouter } from './routes/history.js';
import { commentsRouter } from './routes/comments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.PUBLIC_DIR || resolve(__dirname, '../../');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/identify', identifyRoute);
app.post('/api/logout', logoutRoute);
app.get('/api/me', meRoute);
app.use('/api', treeRouter);
app.use('/api', historyRouter);
app.use('/api', commentsRouter);

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT} (public: ${PUBLIC_DIR})`);
});
