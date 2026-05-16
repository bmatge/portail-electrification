// Script de ré-onboarding des utilisateurs legacy après la bascule v1 → v2.
//
// La v1 utilisait un simple pseudo en cookie, pas de session avec email.
// Au cutover, les comptes existants sont importés en `pending` (display_name
// préservé, email null). Ce script envoie un magic link à chaque user
// existant identifiable par email (pris en argument CLI ou depuis un fichier).
//
// Usage :
//   node --experimental-strip-types ops/seed-invites.ts \
//        --base-url=https://latelier.bercy.matge.com \
//        alice@example.fr bob@example.fr
//
// Ou via fichier (1 email par ligne, # = commentaire) :
//   node --experimental-strip-types ops/seed-invites.ts \
//        --base-url=https://latelier.bercy.matge.com \
//        --file=ops/invites.txt
//
// Le script lit la même DB que le server (DB_PATH ou défaut). Si MAILER_DRIVER
// est `console`, les liens sont affichés sur stdout (utile pour qu'un admin
// copie/colle aux users). Sinon `smtp`, les emails partent réellement.

import { readFileSync } from 'node:fs';
import { loadConfig } from '../server/src/config/env.js';
import { createDatabase } from '../server/src/db/client.js';
import { createMailerFromEnv } from '../server/src/services/mailer.service.js';
import { requestMagicLink } from '../server/src/services/magic-link.service.js';

interface CliArgs {
  baseUrl: string;
  emails: string[];
}

function parseArgs(argv: readonly string[]): CliArgs {
  let baseUrl = '';
  const emails: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--file=')) {
      const path = arg.slice('--file='.length);
      const lines = readFileSync(path, 'utf8').split('\n');
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        emails.push(line);
      }
    } else if (!arg.startsWith('--')) {
      emails.push(arg);
    }
  }
  return { baseUrl, emails };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseUrl) {
    console.error('Erreur : --base-url=<url> requis (ex: https://latelier.bercy.matge.com)');
    process.exit(1);
  }
  if (args.emails.length === 0) {
    console.error('Erreur : aucun email fourni (passer des arguments ou --file=path)');
    process.exit(1);
  }

  const config = loadConfig();
  const { k } = createDatabase({ path: config.DB_PATH });
  const mailer = await createMailerFromEnv();

  console.log(
    `Envoi de ${args.emails.length} magic link(s) via ${process.env['MAILER_DRIVER'] ?? '(default)'}…`,
  );
  let ok = 0;
  let fail = 0;
  for (const email of args.emails) {
    try {
      await requestMagicLink(k, mailer, {
        email,
        baseUrl: args.baseUrl,
        ip: null,
        userAgent: 'seed-invites/1.0',
      });
      console.log(`  ✓ ${email}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${email}: ${(e as Error).message}`);
      fail++;
    }
  }
  console.log(`\nTerminé : ${ok} OK, ${fail} échec(s).`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
