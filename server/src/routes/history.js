import { Router } from 'express';
import { db, getHeadRevision } from '../db.js';
import { requireUser } from '../auth.js';

export const historyRouter = Router({ mergeParams: true });

const listRevisions = db.prepare(`
  SELECT r.id, r.parent_id, r.message, r.created_at, r.reverts_id,
         u.id AS author_id, u.name AS author_name
  FROM revisions r
  JOIN users u ON u.id = r.author_id
  WHERE r.project_id = ?
  ORDER BY r.id DESC
  LIMIT ?
`);

const getRevision = db.prepare(`
  SELECT r.id, r.parent_id, r.tree_json, r.message, r.created_at, r.reverts_id,
         u.id AS author_id, u.name AS author_name
  FROM revisions r
  JOIN users u ON u.id = r.author_id
  WHERE r.project_id = ? AND r.id = ?
`);

const insertRevision = db.prepare(`
  INSERT INTO revisions (project_id, parent_id, tree_json, author_id, message, reverts_id)
  VALUES (?, ?, ?, ?, ?, ?)
  RETURNING id, parent_id, message, created_at, reverts_id
`);

function serialize(row) {
  return {
    id: row.id,
    parent_id: row.parent_id,
    message: row.message,
    created_at: row.created_at,
    reverts_id: row.reverts_id,
    author: { id: row.author_id, name: row.author_name },
  };
}

historyRouter.get('/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = listRevisions.all(req.project.id, limit);
  const head = getHeadRevision(req.project.id);
  res.json({
    head_id: head?.id ?? null,
    revisions: rows.map(serialize),
  });
});

historyRouter.get('/revisions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const row = getRevision.get(req.project.id, id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({
    revision: serialize(row),
    tree: JSON.parse(row.tree_json),
  });
});

historyRouter.post('/revisions/:id/revert', requireUser, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const source = getRevision.get(req.project.id, id);
  if (!source) return res.status(404).json({ error: 'not_found' });

  const head = getHeadRevision(req.project.id);
  const message = String(req.body?.message || `Revert vers révision #${id}`).slice(0, 200);

  const inserted = insertRevision.get(
    req.project.id,
    head?.id ?? null,
    source.tree_json,
    req.user.id,
    message,
    id,
  );
  res.json({
    revision: {
      ...inserted,
      author: { id: req.user.id, name: req.user.name },
    },
  });
});
