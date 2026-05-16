// Bootstrap : charge la config, initialise la DB, applique les migrations,
// seede le projet historique, instancie le mailer, puis démarre l'app.

import { loadConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrator.js';
import { seedDefaultProject } from './services/seed.service.js';
import { createConsoleMailer } from './services/mailer.service.js';
import { createApp } from './app.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { raw, k } = createDatabase({ path: config.DB_PATH });
  const applied = runMigrations(raw);
  if (applied.length > 0) logger.info({ applied }, 'migrations appliquées');
  await seedDefaultProject(k);

  const mailer = createConsoleMailer();
  const app = createApp({
    k,
    mailer,
    publicDir: config.PUBLIC_DIR,
    serveStatic: true,
    hardenForProd: config.NODE_ENV === 'production',
  });
  app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, public: config.PUBLIC_DIR, env: config.NODE_ENV },
      'server listening',
    );
  });
}

void main();
