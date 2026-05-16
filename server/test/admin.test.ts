import { describe, it, expect } from 'vitest';
import { loginAs, makeFixture } from './setup.js';

const ADMIN = { extraRoles: [{ role: 'admin' as const, projectId: null }] };

describe('admin routes', () => {
  it('GET /api/admin/users — viewer → 403, admin → 200', async () => {
    const fx = await makeFixture();
    const viewer = await loginAs(fx, 'viewer@test.fr');
    expect((await viewer.get('/api/admin/users')).status).toBe(403);
    const admin = await loginAs(fx, 'admin@test.fr', ADMIN);
    const res = await admin.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    // viewer + admin créés via signup
    expect(res.body.users.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/admin/users/:id/disable bloque le login, /enable le restaure', async () => {
    const fx = await makeFixture();
    const alice = await loginAs(fx, 'alice@test.fr');
    const admin = await loginAs(fx, 'admin@test.fr', ADMIN);
    const list = await admin.get('/api/admin/users');
    const aliceRow: { id: number; email: string } = list.body.users.find(
      (u: { email: string | null }) => u.email === 'alice@test.fr',
    );

    await admin.post(`/api/admin/users/${aliceRow.id}/disable`).expect(204);
    // La session existante d'Alice doit retourner 401 (status != active).
    const me = await alice.get('/api/me');
    expect(me.status).toBe(401);

    await admin.post(`/api/admin/users/${aliceRow.id}/enable`).expect(204);
    // Le statut est rétabli, mais la session d'Alice reste valide en DB
    // (attach-user devrait recharger le user et l'autoriser).
    const me2 = await alice.get('/api/me');
    expect(me2.status).toBe(200);
  });

  it('POST/DELETE /api/admin/users/:id/roles grant + revoke', async () => {
    const fx = await makeFixture();
    const viewer = await loginAs(fx, 'viewer@test.fr');
    const admin = await loginAs(fx, 'admin@test.fr', ADMIN);
    const list = await admin.get('/api/admin/users');
    const viewerRow: { id: number } = list.body.users.find(
      (u: { email: string | null }) => u.email === 'viewer@test.fr',
    );

    // Grant editor
    await admin.post(`/api/admin/users/${viewerRow.id}/roles`).send({ role: 'editor' }).expect(204);
    // Vérifier qu'elle peut maintenant écrire (créer un projet)
    const create = await viewer.post('/api/projects').send({ slug: 'after-grant', name: 'X' });
    expect(create.status).toBe(201);

    // Revoke editor
    await admin
      .delete(`/api/admin/users/${viewerRow.id}/roles`)
      .send({ role: 'editor' })
      .expect(204);
    const create2 = await viewer.post('/api/projects').send({ slug: 'after-revoke', name: 'Y' });
    expect(create2.status).toBe(403);
  });

  it('GET /api/admin/audit-log — admin lit, viewer → 403', async () => {
    const fx = await makeFixture();
    const viewer = await loginAs(fx, 'viewer@test.fr');
    expect((await viewer.get('/api/admin/audit-log')).status).toBe(403);
    const admin = await loginAs(fx, 'admin@test.fr', ADMIN);
    const res = await admin.get('/api/admin/audit-log');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    // Au moins les 2 auth.identify (viewer + admin)
    expect(
      res.body.entries.filter((e: { action: string }) => e.action === 'auth.identify').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/admin/audit-log filtre par action', async () => {
    const fx = await makeFixture();
    const admin = await loginAs(fx, 'admin@test.fr', ADMIN);
    const res = await admin.get('/api/admin/audit-log?action=auth.identify');
    expect(res.status).toBe(200);
    expect(res.body.entries.every((e: { action: string }) => e.action === 'auth.identify')).toBe(
      true,
    );
  });
});
