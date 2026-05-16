import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { loginAs, makeFixture } from './setup.js';

const EDITOR = { extraRoles: [{ role: 'editor' as const, projectId: null }] };

describe('projects routes', () => {
  it('GET /api/projects retourne le projet historique (id=1, slug=portail-electrification)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'viewer@test.fr');
    const res = await agent.get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0]).toMatchObject({
      id: 1,
      slug: 'portail-electrification',
    });
  });

  it('GET /api/projects/:slug retourne 404 si le projet n’existe pas', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'viewer@test.fr');
    const res = await agent.get('/api/projects/inconnu');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'project_not_found' });
  });

  it('POST /api/projects sans auth → 401', async () => {
    const fx = await makeFixture();
    const res = await request(fx.app).post('/api/projects').send({ slug: 'demo', name: 'Démo' });
    expect(res.status).toBe(401);
  });

  it('POST /api/projects sans editor → 403', async () => {
    const fx = await makeFixture();
    const viewer = await loginAs(fx, 'viewer@test.fr');
    const res = await viewer.post('/api/projects').send({ slug: 'demo', name: 'Démo' });
    expect(res.status).toBe(403);
  });

  it('POST /api/projects crée un nouveau projet seedé (editor)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);
    const create = await agent
      .post('/api/projects')
      .send({ slug: 'demo', name: 'Démo', description: 'Un projet de test' });
    expect(create.status).toBe(201);
    expect(create.body.project).toMatchObject({ slug: 'demo', name: 'Démo' });

    const tree = await agent.get('/api/projects/demo/tree');
    expect(tree.status).toBe(200);
    expect(tree.body.tree).toMatchObject({ id: 'root', label: 'Démo' });

    const vocab = await agent.get('/api/projects/demo/data/vocab');
    expect(vocab.status).toBe(200);
    expect(vocab.body.data.audiences).toEqual([{ key: 'tous-publics', label: 'Tous publics' }]);
  });

  it('POST /api/projects rejette un slug invalide', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);
    const res = await agent.post('/api/projects').send({ slug: '-demo', name: 'Démo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_slug');
  });

  it('POST /api/projects rejette un slug déjà pris (409 slug_taken)', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);
    await agent.post('/api/projects').send({ slug: 'demo', name: 'Démo' });
    const res = await agent.post('/api/projects').send({ slug: 'demo', name: 'Autre' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'slug_taken' });
  });

  it('GET /api/projects/:slug/export renvoie un bundle JSON téléchargeable', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);
    const res = await agent.get('/api/projects/portail-electrification/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body).toMatchObject({
      version: 1,
      project: { slug: 'portail-electrification' },
    });
    expect(res.body.tree).toBeTruthy();
    expect(res.body.data.vocab).toBeTruthy();
  });

  it('POST /api/projects/import + DELETE /api/projects/:slug — round trip', async () => {
    const fx = await makeFixture();
    const agent = await loginAs(fx, 'alice@test.fr', EDITOR);

    const exportRes = await agent.get('/api/projects/portail-electrification/export');
    const bundle = exportRes.body;
    bundle.project.slug = 'copie';
    bundle.project.name = 'Copie test';

    const imported = await agent.post('/api/projects/import').send({ bundle });
    expect(imported.status).toBe(201);
    expect(imported.body.final_slug).toBe('copie');

    const list = await agent.get('/api/projects');
    expect(list.body.projects.map((p: { slug: string }) => p.slug)).toContain('copie');

    const del = await agent.delete('/api/projects/copie');
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const after = await agent.get('/api/projects');
    expect(after.body.projects.map((p: { slug: string }) => p.slug)).not.toContain('copie');
  });
});
