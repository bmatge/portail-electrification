// Sert le bundle SPA Vue (web/dist/) et fait le fallback `index.html`
// pour toute route non-API non-asset, afin que le routeur côté client
// (vue-router en mode history) prenne le relais au refresh.
//
// Monté APRÈS les routers `/api/*` dans `app.ts`, donc le catch-all ne
// risque pas d'intercepter une API.

import express, { Router, type RequestHandler } from 'express';
import { resolve } from 'node:path';

export function makeStaticRouter(publicDir: string): Router {
  const router = Router();

  // Sert tous les fichiers physiques (assets hashés, dsfr.css, favicon…)
  // sans index automatique et sans rebrancher d'extensions implicites.
  router.use(express.static(publicDir, { index: false }));

  // Fallback SPA : toute autre route → index.html.
  router.get('*', ((_req, res) => {
    res.sendFile(resolve(publicDir, 'index.html'));
  }) as RequestHandler);

  return router;
}
