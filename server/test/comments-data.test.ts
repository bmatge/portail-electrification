import { describe, it, expect } from 'vitest';
import { loginAs, makeFixture } from './setup.js';

const EDITOR = { extraRoles: [{ role: 'editor' as const, projectId: null }] };

describe('comments routes', () => {
  it('GET /comments?node_id=root liste vide au démarrage (viewer ok)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'viewer@test.fr');
    const res = await agent.get('/api/projects/portail-electrification/comments?node_id=root');
    expect(res.status).toBe(200);
    expect(res.body.comments).toEqual([]);
  });

  it('GET /comments sans node_id retourne les counts par node (viewer ok)', async () => {
    const fx = await makeFixture();
    const alice = await loginAs(fx, 'alice@test.fr');
    await alice
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: 'hello' });
    await alice
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: 'world' });

    const viewer = await loginAs(fx, 'viewer@test.fr');
    const counts = await viewer.get('/api/projects/portail-electrification/comments');
    expect(counts.body.counts).toEqual({ n1: 2 });
  });

  it('POST /comments exige body non vide < 4000 chars', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr');

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
    const fx = await makeFixture();
    const alice = await loginAs(fx, 'alice@test.fr');
    const created = await alice
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'n1', body: 'mine' });
    const commentId = created.body.comment.id;

    const bob = await loginAs(fx, 'bob@test.fr');
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
  it('GET /data/:key retourne la valeur seedée pour vocab (viewer ok)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'viewer@test.fr');
    const res = await agent.get('/api/projects/portail-electrification/data/vocab');
    expect(res.status).toBe(200);
    expect(res.body.data.audiences[0]).toMatchObject({ key: 'particuliers' });
  });

  it('GET /data/unknown → 400 invalid_key', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'viewer@test.fr');
    const res = await agent.get('/api/projects/portail-electrification/data/unknown');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_key' });
  });

  it('PUT /data/:key persiste la nouvelle valeur (editor)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);
    const newVocab = {
      audiences: [{ key: 'tous', label: 'Tous' }],
      deadlines: [],
      page_types: [],
    };
    const put = await agent
      .put('/api/projects/portail-electrification/data/vocab')
      .send({ data: newVocab });
    expect(put.status).toBe(200);
    const read = await agent.get('/api/projects/portail-electrification/data/vocab');
    expect(read.body.data).toEqual(newVocab);
  });

  it('PUT /data/:key viewer → 403', async () => {
    const fx = await makeFixture();
    const viewer = await loginAs(fx, 'viewer@test.fr');
    const res = await viewer
      .put('/api/projects/portail-electrification/data/vocab')
      .send({ data: {} });
    expect(res.status).toBe(403);
  });
});
