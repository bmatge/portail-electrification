// Fabrique une app v2 isolée par test, branchée sur une DB SQLite en mémoire
// puis seedée via les migrations + le seed du projet historique. Chaque test
// repart d'un état vierge → pas de pollution croisée.

import type { Express } from 'express';
import type { Db } from '../src/db/client.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { seedDefaultProject } from '../src/services/seed.service.js';
import { createApp } from '../src/app.js';

export interface TestFixture {
  readonly app: Express;
  readonly db: Db;
}

export function makeFixture(): TestFixture {
  const db = createDatabase({ path: ':memory:' });
  runMigrations(db);
  seedDefaultProject(db);
  const app = createApp({ db, serveStatic: false });
  return { app, db };
}
