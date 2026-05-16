// Script CLI : grant admin global à un ou plusieurs emails sans avoir
// à redémarrer le serveur (utile pour réagir vite à un besoin opérationnel
// sans toucher au .env / docker-compose et redéployer).
//
// Usage :
//   docker compose exec app node --experimental-strip-types /app/ops/grant-admin.ts \
//     bertrand@matge.com [other@example.fr ...]
//
// Ou en dev local depuis le repo racine :
//   node --experimental-strip-types ops/grant-admin.ts bertrand@matge.com
//
// Idempotent : si l'user existe déjà avec admin global, ne refait rien.
// Si l'user n'existe pas, il est créé en `active` avec un display_name
// dérivé de la partie locale de l'email (Bertrand pour bertrand@…).

import { loadConfig } from '../server/src/config/env.js';
import { createDatabase } from '../server/src/db/client.js';
import { seedBootstrapAdmins } from '../server/src/services/bootstrap-admin.service.js';

async function main(): Promise<void> {
  const emails = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (emails.length === 0) {
    console.error('Usage : grant-admin.ts <email> [<email>...]');
    process.exit(1);
  }

  const config = loadConfig();
  const { k } = createDatabase({ path: config.DB_PATH });

  const results = await seedBootstrapAdmins(k, emails);
  for (const r of results) {
    const icon = {
      created: '🆕 créé + admin global accordé',
      granted: '✅ admin global accordé',
      already_admin: '— déjà admin global',
      skipped: '⚠ ignoré (email invalide)',
    }[r.action];
    console.log(`  ${icon} : ${r.email}${r.userId ? ` (user #${r.userId})` : ''}`);
  }
  process.exit(0);
}

void main();
