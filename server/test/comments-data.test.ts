import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture } from './setup.js';

describe('comments routes', () => {
  it('GET /comments?node_id=root liste vide au démarrage', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get(
      '/api/projects/portail-electrification/comments?node_id=root',
    );
    expect(res.status).toBe(200);
    expect(res.body.comments).toEqual([]);
  });

  it('GET /comments sans node_id retourne les counts par node', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });
    await agent
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: 'hello' });
    await agent
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: 'world' });

    const counts = await agent.get('/api/projects/portail-electrification/comments');
    expect(counts.body.counts).toEqual({ n1: 2 });
  });

  it('POST /comments exige body non vide < 4000 chars', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });

    const empty = await agent
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: '' });
    expect(empty.status).toBe(400);

    const tooLong = await agent
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: 'x'.repeat(4001) });
    expect(tooLong.status).toBe(400);
  });

  it('DELETE /comments/:id — auteur seul autorisé (sinon 403)', async () => {
    const { app } = await makeFixture();
    const alice = request.agent(app);
    await alice.post('/api/identify').send({ name: 'Alice' });
    const created = await alice
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: 'mine' });
    const commentId = created.body.comment.id;

    const bob = request.agent(app);
    await bob.post('/api/identify').send({ name: 'Bob' });
    const bobDelete = await bob.delete(
      `/api/projects/portail-electrification/comments/${commentId}`,
    );
    expect(bobDelete.status).toBe(403);

    const aliceDelete = await alice.delete(
      `/api/projects/portail-electrification/comments/${commentId}`,
    );
    expect(aliceDelete.status).toBe(204);
  });
});

describe('data routes', () => {
  it('GET /data/:key retourne la valeur seedée pour vocab', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/projects/portail-electrification/data/vocab');
    expect(res.status).toBe(200);
    expect(res.body.data.audiences[0]).toMatchObject({ key: 'particuliers' });
  });

  it('GET /data/unknown → 400 invalid_key', async () => {
    const { app } = await makeFixture();
    const res = await request(app).get('/api/projects/portail-electrification/data/unknown');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_key' });
  });

  it('PUT /data/:key persiste la nouvelle valeur', async () => {
    const { app } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });
    const newVocab = { audiences: [{ key: 'tous', label: 'Tous' }], deadlines: [], page_types: [] };
    const put = await agent
      .put('/api/projects/portail-electrification/data/vocab')
      .send({ data: newVocab });
    expect(put.status).toBe(200);
    const read = await agent.get('/api/projects/portail-electrification/data/vocab');
    expect(read.body.data).toEqual(newVocab);
  });

  it('PUT /data/:key exige une identification', async () => {
    const { app } = await makeFixture();
    const res = await request(app)
      .put('/api/projects/portail-electrification/data/vocab')
      .send({ data: {} });
    expect(res.status).toBe(401);
  });
});
