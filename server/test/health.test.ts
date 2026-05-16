import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeFixture } from './setup.js';

describe('health route', () => {
  it('GET /api/health → 200 {ok:true}', async () => {
    const { app } = makeFixture();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
