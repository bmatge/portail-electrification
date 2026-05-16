// Parse l'environnement via Zod et expose une `Config` immuable.
// Toute lecture de `process.env` doit passer par ici — pas de magie ailleurs.

import { z } from 'zod';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(here, '../../../data/app.db');
const DEFAULT_PUBLIC_DIR = resolve(here, '../../../');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().min(1).default(DEFAULT_DB_PATH),
  PUBLIC_DIR: z.string().min(1).default(DEFAULT_PUBLIC_DIR),
});

export type Config = z.infer<typeof EnvSchema>;

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Configuration invalide: ${formatted}`);
  }
  cached = parsed.data;
  return cached;
}

// Pour les tests : permet de reset le cache et d'injecter un env custom.
export function resetConfigCache(): void {
  cached = null;
}
