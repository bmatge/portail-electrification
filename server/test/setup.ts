// Fabrique une app v2 isolée par test, branchée sur une DB SQLite en mémoire
// puis seedée via les migrations + le seed du projet historique. Chaque test
// repart d'un état vierge → pas de pollution croisée.

import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '@latelier/shared';
import type { Kdb } from '../src/db/client.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { seedDefaultProject } from '../src/services/seed.service.js';
import { createApp } from '../src/app.js';
import { createMemoryMailer, type Mailer } from '../src/services/mailer.service.js';
import { findUserByEmail } from '../src/repositories/user.repo.js';
import { grantRole } from '../src/repositories/user-role.repo.js';

export interface TestFixture {
  readonly app: Express;
  readonly k: Kdb;
  readonly mailer: Mailer;
}

export async function makeFixture(): Promise<TestFixture> {
  const { raw, k } = createDatabase({ path: ':memory:' });
  runMigrations(raw);
  await seedDefaultProject(k);
  const mailer = createMemoryMailer();
  const app = createApp({ k, mailer, serveStatic: false });
  return { app, k, mailer };
}

// Connecte un user via le vrai flow magic link (memory mailer expose le
// token). Le user reçoit viewer global par défaut au self-signup ; on lui
// accorde ensuite les rôles supplémentaires demandés.
export interface LoginAsOptions {
  readonly extraRoles?: ReadonlyArray<{
    readonly role: Role;
    readonly projectId?: number | null;
  }>;
}

export async function loginAs(
  fx: TestFixture,
  email: string,
  options: LoginAsOptions = {},
): Promise<ReturnType<typeof request.agent>> {
  fx.mailer.clear();
  const agent = request.agent(fx.app);
  const reqRes = await agent.post('/api/auth/magic-link').send({ email });
  if (reqRes.status !== 204) {
    throw new Error(`magic-link request failed: ${reqRes.status} ${JSON.stringify(reqRes.body)}`);
  }
  const inbox = fx.mailer.inbox();
  const last = inbox[inbox.length - 1];
  if (!last) throw new Error('mailer received no magic link');
  const cb = await agent
    .get(`/api/auth/callback?token=${encodeURIComponent(last.token)}`)
    .set('Accept', 'application/json');
  if (cb.status !== 200) {
    throw new Error(`callback failed: ${cb.status} ${JSON.stringify(cb.body)}`);
  }
  if (options.extraRoles && options.extraRoles.length > 0) {
    const user = await findUserByEmail(fx.k, email);
    if (!user) throw new Error('user not found after callback');
    for (const r of options.extraRoles) {
      await grantRole(fx.k, user.id, r.role, r.projectId ?? null, null);
    }
  }
  return agent;
}
