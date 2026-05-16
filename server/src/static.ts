// Routage des pages statiques de l'app v1 (HTML + assets) servies par le
// même Express. Sera supprimé en Phase 10 quand la SPA Vue prendra le relais
// sur l'intégralité du front (cf. plan v2, P9-P10).

import express, { Router, type RequestHandler } from 'express';
import { resolve } from 'node:path';

const PAGES = new Set([
  'objectifs',
  'arborescence',
  'maquette',
  'roadmap',
  'mesures',
  'dispositifs',
  'structure-drupal',
]);

export function makeStaticRouter(publicDir: string): Router {
  const router = Router();

  router.use('/assets', express.static(resolve(publicDir, 'assets')));

  router.get('/p/:slug', ((req, res) => {
    const slug = String(req.params['slug'] ?? '');
    res.redirect(`/p/${encodeURIComponent(slug)}/objectifs`);
  }) as RequestHandler);

  router.get('/p/:slug/:page', ((req, res, next) => {
    const page = req.params['page'];
    if (typeof page !== 'string' || !PAGES.has(page)) {
      next();
      return;
    }
    res.sendFile(resolve(publicDir, `${page}.html`));
  }) as RequestHandler);

  router.get('/', ((_req, res) => {
    res.sendFile(resolve(publicDir, 'index.html'));
  }) as RequestHandler);

  router.use(express.static(publicDir, { index: false, extensions: ['html'] }));

  return router;
}
