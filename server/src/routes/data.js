import { Router } from 'express';
import { db } from '../db.js';
import { requireUser } from '../auth.js';

export const dataRouter = Router({ mergeParams: true });

const KEYS = new Set(['dispositifs', 'mesures', 'objectifs', 'drupal_structure']);

const getData = db.prepare('SELECT json_value, updated_at FROM project_data WHERE project_id = ? AND key = ?');
const upsertData = db.prepare(`
  INSERT INTO project_data (project_id, key, json_value, updated_by, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(project_id, key) DO UPDATE
    SET json_value = excluded.json_value,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
`);

dataRouter.get('/data/:key', (req, res) => {
  const key = req.params.key;
  if (!KEYS.has(key)) return res.status(400).json({ error: 'invalid_key' });
  const row = getData.get(req.project.id, key);
  if (!row) return res.json({ data: null, updated_at: null });
  res.json({ data: JSON.parse(row.json_value), updated_at: row.updated_at });
});

dataRouter.put('/data/:key', requireUser, (req, res) => {
  const key = req.params.key;
  if (!KEYS.has(key)) return res.status(400).json({ error: 'invalid_key' });
  const { data } = req.body || {};
  if (data === undefined) return res.status(400).json({ error: 'data_required' });
  upsertData.run(req.project.id, key, JSON.stringify(data), req.user.id);
  res.json({ ok: true });
});
