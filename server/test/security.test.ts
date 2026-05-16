import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrator.js';
import { seedDefaultProject } from '../src/services/seed.service.js';
import { createApp } from '../src/app.js';
import { createMemoryMailer } from '../src/services/mailer.service.js';

async function hardenedFixture(): Promise<ReturnType<typeof createApp>> {
  const { raw, k } = createDatabase({ path: ':memory:' });
  runMigrations(raw);
  await seedDefaultProject(k);
  const mailer = createMemoryMailer();
  return createApp({ k, mailer, serveStatic: false, hardenForProd: true });
}

describe('security middleware', () => {
  it('helmet pose Content-Security-Policy + X-Content-Type-Options + Referrer-Policy', async () => {
    const app = await hardenedFixture();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('pino-http pose X-Request-Id sur la réponse', async () => {
    const app = await hardenedFixture();
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']!.length).toBeGreaterThan(8);
  });

  it('rate-limit auth bucket : 11 POST /auth/magic-link → 429', async () => {
    const app = await hardenedFixture();
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app)
        .post('/api/auth/magic-link')
        .send({ email: `flood-${i}@test.fr` });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
