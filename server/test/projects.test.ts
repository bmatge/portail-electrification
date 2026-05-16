import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture } from './setup.js';

describe('projects routes', () => {
  it('GET /api/projects retourne le projet historique (id=1, slug=portail-electrification)', async () => {
    const { app } = makeFixture();
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0]).toMatchObject({
      id: 1,
      slug: 'portail-electrification',
    });
  });

  it('GET /api/projects/:slug retourne 404 si le projet n’existe pas', async () => {
    const { app } = makeFixture();
    const res = await request(app).get('/api/projects/inconnu');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'project_not_found' });
  });

  it('POST /api/projects exige une identification', async () => {
    const { app } = makeFixture();
    const res = await request(app).post('/api/projects').send({ slug: 'demo', name: 'Démo' });
    expect(res.status).toBe(401);
  });

  it('POST /api/projects crée un nouveau projet seedé', async () => {
    const { app } = makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });
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
    const { app } = makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });
    // Slug commençant par un tiret : trim+lowercase ne sauve pas, et SLUG_RE
    // exige une alphanum en position 1.
    const res = await agent.post('/api/projects').send({ slug: '-demo', name: 'Démo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_slug');
  });

  it('POST /api/projects rejette un slug déjà pris (409 slug_taken)', async () => {
    const { app } = makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });
    await agent.post('/api/projects').send({ slug: 'demo', name: 'Démo' });
    const res = await agent.post('/api/projects').send({ slug: 'demo', name: 'Autre' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'slug_taken' });
  });

  it('GET /api/projects/:slug/export renvoie un bundle JSON téléchargeable', async () => {
    const { app } = makeFixture();
    const res = await request(app).get('/api/projects/portail-electrification/export');
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
    const { app } = makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });

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
