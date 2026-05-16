// Fabrique une app v2 isolée par test, branchée sur une DB SQLite en mémoire
// puis seedée via les migrations + le seed du projet historique. Chaque test
// repart d'un état vierge → pas de pollution croisée.

import type { Express } from 'express';
import type { Kdb } from '../src/db/client.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { seedDefaultProject } from '../src/services/seed.service.js';
import { createApp } from '../src/app.js';

export interface TestFixture {
  readonly app: Express;
  readonly k: Kdb;
}

export async function makeFixture(): Promise<TestFixture> {
  const { raw, k } = createDatabase({ path: ':memory:' });
  runMigrations(raw);
  await seedDefaultProject(k);
  const app = createApp({ k, serveStatic: false });
  return { app, k };
}
