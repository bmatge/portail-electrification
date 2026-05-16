import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture } from './setup.js';

interface AuditRow {
  readonly action: string;
  readonly project_id: number | null;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
}

async function listAudit(k: import('../src/db/client.js').Kdb): Promise<readonly AuditRow[]> {
  return await k
    .selectFrom('audit_log')
    .select(['action', 'project_id', 'resource_type', 'resource_id'])
    .orderBy('id', 'asc')
    .execute();
}

describe('audit log', () => {
  it('enregistre les mutations critiques (project.create, tree.write, comment.create, data.write, project.delete)', async () => {
    const { app, k } = await makeFixture();
    const agent = request.agent(app);
    await agent.post('/api/identify').send({ name: 'Alice' });

    await agent.post('/api/projects').send({ slug: 'audit-demo', name: 'Démo' }).expect(201);

    const tree = await agent.get('/api/projects/audit-demo/tree').expect(200);
    await agent
      .put('/api/projects/audit-demo/tree')
      .set('If-Match', String(tree.body.revision.id))
      .send({ tree: { id: 'root', label: 'patched', children: [] } })
      .expect(200);

    await agent
      .post('/api/projects/audit-demo/comments')
      .send({ node_id: 'root', body: 'hello' })
      .expect(201);

    await agent
      .put('/api/projects/audit-demo/data/vocab')
      .send({ data: { audiences: [], deadlines: [], page_types: [] } })
      .expect(200);

    await agent.delete('/api/projects/audit-demo').expect(200);

    const entries = await listAudit(k);
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('project.create');
    expect(actions).toContain('tree.write');
    expect(actions).toContain('comment.create');
    expect(actions).toContain('data.write');
    expect(actions).toContain('project.delete');
  });

  it('n’enregistre rien pour les routes en lecture pure', async () => {
    const { app, k } = await makeFixture();
    await request(app).get('/api/projects').expect(200);
    await request(app).get('/api/projects/portail-electrification/tree').expect(200);
    const entries = await listAudit(k);
    expect(entries).toHaveLength(0);
  });
});
