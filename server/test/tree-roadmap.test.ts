import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture } from './setup.js';

describe('tree routes (+ optimistic locking)', () => {
  it('GET /tree retourne la révision tête + l’arbre seedé', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/projects/portail-electrification/tree');
    expect(res.status).toBe(200);
    expect(res.body.revision.id).toBeGreaterThanOrEqual(1);
    expect(res.body.tree.id).toBe('root');
  });

  it('PUT /tree exige une identification', async () => {
    const { app } = await makeFixture();
    const res = await request(app)
      .put('/api/projects/portail-electrification/tree')
      .send({ tree: { id: 'root', children: [] } });
    expect(res.status).toBe(401);
  });

  it('PUT /tree crée une nouvelle révision, GET /history la retrouve', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });

    const before = await agent.get('/api/projects/portail-electrification/tree');
    const headId: number = before.body.revision.id;

    const save = await agent
      .put('/api/projects/portail-electrification/tree')
      .set('If-Match', String(headId))
      .send({ tree: { id: 'root', label: 'Patché', children: [] }, message: 'patch' });
    expect(save.status).toBe(200);
    expect(save.body.revision.parent_id).toBe(headId);

    const hist = await agent.get('/api/projects/portail-electrification/history');
    expect(hist.body.head_id).toBe(save.body.revision.id);
    expect(hist.body.revisions.length).toBeGreaterThanOrEqual(2);
  });

  it('PUT /tree avec If-Match désynchronisé → 409 conflict + head', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });

    const res = await agent
      .put('/api/projects/portail-electrification/tree')
      .set('If-Match', '999')
      .send({ tree: { id: 'root', children: [] } });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict');
    expect(res.body.head).toMatchObject({ id: 1 });
  });

  it('POST /revisions/:id/revert remet la révision source en tête', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });
    const initial = await agent.get('/api/projects/portail-electrification/tree');
    const initialId: number = initial.body.revision.id;

    // Modifier l'arbre une fois
    await agent
      .put('/api/projects/portail-electrification/tree')
      .set('If-Match', String(initialId))
      .send({ tree: { id: 'root', label: 'V2', children: [] } });

    // Puis revert vers l'initial
    const rev = await agent
      .post(`/api/projects/portail-electrification/revisions/${initialId}/revert`)
      .send({ message: 'oups' });
    expect(rev.status).toBe(200);
    expect(rev.body.revision.reverts_id).toBe(initialId);

    const after = await agent.get('/api/projects/portail-electrification/tree');
    expect(after.body.tree.label).not.toBe('V2');
  });
});

describe('roadmap routes', () => {
  it('GET /roadmap retourne la révision tête + roadmap seed', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/projects/portail-electrification/roadmap');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.roadmap.items)).toBe(true);
  });

  it('PUT /roadmap exige une identification', async () => {
    const { app } = await makeFixture();
    const res = await request(app)
      .put('/api/projects/portail-electrification/roadmap')
      .send({ roadmap: { meta: {}, items: [] } });
    expect(res.status).toBe(401);
  });

  it('PUT /roadmap valide, GET /roadmap/history la trouve, GET /roadmap/revisions/:id la rejoue', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });

    const head = await agent.get('/api/projects/portail-electrification/roadmap');
    const headId: number = head.body.revision.id;

    const save = await agent
      .put('/api/projects/portail-electrification/roadmap')
      .set('If-Match', String(headId))
      .send({ roadmap: { meta: { v: 1 }, items: [{ id: 'a' }] } });
    expect(save.status).toBe(200);

    const hist = await agent.get('/api/projects/portail-electrification/roadmap/history');
    expect(hist.body.head_id).toBe(save.body.revision.id);

    const rev = await agent.get(
      `/api/projects/portail-electrification/roadmap/revisions/${save.body.revision.id}`,
    );
    expect(rev.body.roadmap.items).toEqual([{ id: 'a' }]);
  });

  it('PUT /roadmap avec If-Match désynchronisé → 409', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });
    const res = await agent
      .put('/api/projects/portail-electrification/roadmap')
      .set('If-Match', '999')
      .send({ roadmap: { meta: {}, items: [] } });
    expect(res.status).toBe(409);
  });
});
