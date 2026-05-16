// Bootstrap : charge la config, initialise la DB, applique les migrations,
// seede le projet historique, puis démarre l'app Express.

import { loadConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrator.js';
import { seedDefaultProject } from './services/seed.service.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { raw, k } = createDatabase({ path: config.DB_PATH });
  runMigrations(raw);
  await seedDefaultProject(k);

  const app = createApp({
    k,
    publicDir: config.PUBLIC_DIR,
    serveStatic: true,
  });
  app.listen(config.PORT, () => {
    console.log(`[server] listening on :${config.PORT} (public: ${config.PUBLIC_DIR})`);
  });
}

void main();
