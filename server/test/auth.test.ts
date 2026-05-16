import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture } from './setup.js';

describe('auth routes', () => {
  it('GET /api/me sans cookie → 401 identification_required', async () => {
    const { app } = makeFixture();
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'identification_required' });
  });

  it('POST /api/identify crée la session et /api/me la retourne', async () => {
    const { app } = makeFixture();
    const agent = request.agent(app);
    const identify = await agent.post('/api/identify').send({ name: 'Alice' });
    expect(identify.status).toBe(200);
    expect(identify.body.user.name).toBe('Alice');

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Alice');
  });

  it('POST /api/identify rejette les noms vides ou trop longs', async () => {
    const { app } = makeFixture();
    const empty = await request(app).post('/api/identify').send({ name: '' });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/identify')
      .send({ name: 'x'.repeat(80) });
    expect(tooLong.status).toBe(400);
  });

  it('POST /api/logout supprime la session', async () => {
    const { app } = makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Bob' });
    const logout = await agent.post('/api/logout');
    expect(logout.status).toBe(204);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(401);
  });
});
