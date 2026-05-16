import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { loginAs, makeFixture } from './setup.js';

describe('RBAC — viewer vs editor vs admin', () => {
  it('un viewer ne peut pas PUT /tree (403)', async () => {
    const fx = await makeFixture();
    const viewer = await loginAs(fx, 'viewer@test.fr'); // self-signup = viewer
    const tree = await viewer.get('/api/projects/portail-electrification/tree').expect(200);
    const headId = tree.body.revision.id;
    const res = await viewer
      .put('/api/projects/portail-electrification/tree')
      .set('If-Match', String(headId))
      .send({ tree: { id: 'root', label: 'NO', children: [] } });
    expect(res.status).toBe(403);
  });

  it('un editor peut PUT /tree (200)', async () => {
    const fx = await makeFixture();
    const editor = await loginAs(fx, 'editor@test.fr', {
      extraRoles: [{ role: 'editor', projectId: null }],
    });
    const tree = await editor.get('/api/projects/portail-electrification/tree').expect(200);
    const headId = tree.body.revision.id;
    const res = await editor
      .put('/api/projects/portail-electrification/tree')
      .set('If-Match', String(headId))
      .send({ tree: { id: 'root', label: 'OK', children: [] } });
    expect(res.status).toBe(200);
  });

  it('un editor peut DELETE son projet (own) mais pas celui d’un autre (403)', async () => {
    const fx = await makeFixture();
    const alice = await loginAs(fx, 'alice@test.fr', {
      extraRoles: [{ role: 'editor', projectId: null }],
    });
    await alice.post('/api/projects').send({ slug: 'alice-proj', name: 'Alice' }).expect(201);
    const bob = await loginAs(fx, 'bob@test.fr', {
      extraRoles: [{ role: 'editor', projectId: null }],
    });
    // Bob ne peut pas supprimer le projet d'Alice
    const bobAttempt = await bob.delete('/api/projects/alice-proj');
    expect(bobAttempt.status).toBe(403);
    // Alice peut supprimer le sien
    const aliceDelete = await alice.delete('/api/projects/alice-proj');
    expect(aliceDelete.status).toBe(200);
  });

  it('un admin peut DELETE n’importe quel projet (project:delete:any)', async () => {
    const fx = await makeFixture();
    const alice = await loginAs(fx, 'alice@test.fr', {
      extraRoles: [{ role: 'editor', projectId: null }],
    });
    await alice.post('/api/projects').send({ slug: 'alice-proj', name: 'Alice' }).expect(201);
    const admin = await loginAs(fx, 'admin@test.fr', {
      extraRoles: [{ role: 'admin', projectId: null }],
    });
    const res = await admin.delete('/api/projects/alice-proj');
    expect(res.status).toBe(200);
  });

  it('un viewer peut POST /comments (comments:create) mais pas supprimer celui d’un autre', async () => {
    const fx = await makeFixture();
    const alice = await loginAs(fx, 'alice@test.fr');
    const created = await alice
      .post('/api/projects/portail-electrification/comments')
      .send({ node_id: 'root', body: 'hi' });
    expect(created.status).toBe(201);
    const bob = await loginAs(fx, 'bob@test.fr');
    const bobDelete = await bob.delete(
      `/api/projects/portail-electrification/comments/${created.body.comment.id}`,
    );
    expect(bobDelete.status).toBe(403);
    const aliceDelete = await alice.delete(
      `/api/projects/portail-electrification/comments/${created.body.comment.id}`,
    );
    expect(aliceDelete.status).toBe(204);
  });

  it('GET /api/projects anonyme retourne uniquement les projets publics', async () => {
    const fx = await makeFixture();
    const anon = await request(fx.app).get('/api/projects');
    expect(anon.status).toBe(200);
    // Le projet seed `portail-electrification` est public par défaut (is_public=1).
    expect(anon.body.projects.map((p: { slug: string }) => p.slug)).toContain(
      'portail-electrification',
    );
    const viewer = await loginAs(fx, 'viewer@test.fr');
    expect((await viewer.get('/api/projects')).status).toBe(200);
  });

  it('GET /tree anonyme : 200 sur projet public, 401 si projet basculé en privé', async () => {
    const fx = await makeFixture();
    // Public par défaut
    const anonPublic = await request(fx.app).get('/api/projects/portail-electrification/tree');
    expect(anonPublic.status).toBe(200);
    // Bascule en privé
    const admin = await loginAs(fx, 'admin@test.fr', {
      extraRoles: [{ role: 'admin', projectId: null }],
    });
    await admin
      .patch('/api/projects/portail-electrification')
      .send({ is_public: false })
      .expect(200);
    const anonPrivate = await request(fx.app).get('/api/projects/portail-electrification/tree');
    expect(anonPrivate.status).toBe(401);
  });

  it('PUT /tree anonyme : toujours 401, même sur projet public', async () => {
    const fx = await makeFixture();
    const tree = await request(fx.app)
      .get('/api/projects/portail-electrification/tree')
      .expect(200);
    const res = await request(fx.app)
      .put('/api/projects/portail-electrification/tree')
      .set('If-Match', String(tree.body.revision.id))
      .send({ tree: { id: 'root', label: 'X', children: [] } });
    expect(res.status).toBe(401);
  });

  it('PATCH /projects/:slug : un viewer ne peut pas changer is_public (403)', async () => {
    const fx = await makeFixture();
    const viewer = await loginAs(fx, 'viewer@test.fr');
    const res = await viewer
      .patch('/api/projects/portail-electrification')
      .send({ is_public: false });
    expect(res.status).toBe(403);
  });

  it('PATCH /projects/:slug : un editor peut basculer son projet en privé', async () => {
    const fx = await makeFixture();
    const editor = await loginAs(fx, 'editor@test.fr', {
      extraRoles: [{ role: 'editor', projectId: null }],
    });
    const res = await editor
      .patch('/api/projects/portail-electrification')
      .send({ is_public: false });
    expect(res.status).toBe(200);
    expect(res.body.project.is_public).toBe(false);
  });
});
