import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { loginAs, makeFixture } from './setup.js';

describe('auth — magic link', () => {
  it('GET /api/me sans cookie → 401 identification_required', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'identification_required' });
  });

  it('POST /api/auth/magic-link → 204 + mail collecté + GET /api/auth/callback ouvre la session', async () => {
    const fx = await makeFixture();
    const agent = request.agent(fx.app);

    const req = await agent.post('/api/auth/magic-link').send({ email: 'alice@test.fr' });
    expect(req.status).toBe(204);
    expect(fx.mailer.inbox()).toHaveLength(1);

    const token = fx.mailer.inbox()[0]!.token;
    const cb = await agent
      .get(`/api/auth/callback?token=${token}`)
      .set('Accept', 'application/json');
    expect(cb.status).toBe(200);
    expect(cb.body.created).toBe(true);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('alice@test.fr');
    expect(me.body.user.status).toBe('active');
    // Self-signup → viewer global par défaut.
    expect(me.body.user.roles).toEqual([{ role: 'viewer', projectId: null }]);
  });

  it('POST /api/auth/magic-link avec email invalide → 204 (anti-énumération)', async () => {
    const fx = await makeFixture();
    const res = await request(fx.app).post('/api/auth/magic-link').send({ email: 'nope' });
    expect(res.status).toBe(204);
    expect(fx.mailer.inbox()).toHaveLength(0);
  });

  it('GET /api/auth/callback avec token invalide → 400', async () => {
    const fx = await makeFixture();
    const res = await request(fx.app)
      .get('/api/auth/callback?token=zzzz')
      .set('Accept', 'application/json');
    expect(res.status).toBe(400);
  });

  it('GET /api/auth/callback avec token déjà consommé → 400', async () => {
    const fx = await makeFixture();
    const agent = request.agent(fx.app);
    await agent.post('/api/auth/magic-link').send({ email: 'alice@test.fr' });
    const token = fx.mailer.inbox()[0]!.token;
    await agent.get(`/api/auth/callback?token=${token}`).set('Accept', 'application/json');
    const replay = await request(fx.app)
      .get(`/api/auth/callback?token=${token}`)
      .set('Accept', 'application/json');
    expect(replay.status).toBe(400);
  });

  it('POST /api/auth/logout révoque la session courante', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr');
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(401);
  });

  it('POST /api/auth/logout-all révoque toutes les sessions du user', async () => {
    const fx = await makeFixture();
    const a1 = await loginAs(fx, 'alice@test.fr');
    const a2 = await loginAs(fx, 'alice@test.fr');
    const out = await a1.post('/api/auth/logout-all');
    expect(out.status).toBe(204);
    expect((await a2.get('/api/me')).status).toBe(401);
  });

  it('Self-signup réutilise le user existant sur 2e magic link même email', async () => {
    const fx = await makeFixture();
    const agent1 = request.agent(fx.app);
    await agent1.post('/api/auth/magic-link').send({ email: 'bob@test.fr' });
    const cb1 = await agent1
      .get(`/api/auth/callback?token=${fx.mailer.inbox()[0]!.token}`)
      .set('Accept', 'application/json');
    expect(cb1.body.created).toBe(true);

    fx.mailer.clear();
    const agent2 = request.agent(fx.app);
    await agent2.post('/api/auth/magic-link').send({ email: 'bob@test.fr' });
    const cb2 = await agent2
      .get(`/api/auth/callback?token=${fx.mailer.inbox()[0]!.token}`)
      .set('Accept', 'application/json');
    expect(cb2.body.created).toBe(false);
    expect(cb2.body.user_id).toBe(cb1.body.user_id);
  });
});
