import { Router } from 'express';
import { db, getHeadRevision } from '../db.js';
import { requireUser } from '../auth.js';

export const commentsRouter = Router();

const listForNode = db.prepare(`
  SELECT c.id, c.node_id, c.body, c.created_at, c.revision_id,
         u.id AS author_id, u.name AS author_name
  FROM comments c
  JOIN users u ON u.id = c.author_id
  WHERE c.node_id = ? AND c.deleted_at IS NULL
  ORDER BY c.created_at ASC
`);

const countByNode = db.prepare(`
  SELECT node_id, COUNT(*) AS n
  FROM comments
  WHERE deleted_at IS NULL
  GROUP BY node_id
`);

const insertComment = db.prepare(`
  INSERT INTO comments (node_id, author_id, body, revision_id)
  VALUES (?, ?, ?, ?)
  RETURNING id, node_id, body, created_at, revision_id
`);

const getComment = db.prepare('SELECT id, author_id FROM comments WHERE id = ? AND deleted_at IS NULL');
const softDelete = db.prepare(`UPDATE comments SET deleted_at = datetime('now') WHERE id = ?`);

function serialize(row) {
  return {
    id: row.id,
    node_id: row.node_id,
    body: row.body,
    created_at: row.created_at,
    revision_id: row.revision_id,
    author: { id: row.author_id, name: row.author_name },
  };
}

commentsRouter.get('/comments', (req, res) => {
  const nodeId = String(req.query.node_id || '');
  if (!nodeId) {
    const counts = countByNode.all();
    return res.json({ counts: Object.fromEntries(counts.map(r => [r.node_id, r.n])) });
  }
  const rows = listForNode.all(nodeId);
  res.json({ comments: rows.map(serialize) });
});

commentsRouter.post('/comments', requireUser, (req, res) => {
  const nodeId = String(req.body?.node_id || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!nodeId) return res.status(400).json({ error: 'node_id_required' });
  if (!body) return res.status(400).json({ error: 'body_required' });
  if (body.length > 4000) return res.status(400).json({ error: 'body_too_long' });

  const head = getHeadRevision();
  const inserted = insertComment.get(nodeId, req.user.id, body, head?.id ?? null);
  res.status(201).json({
    comment: {
      id: inserted.id,
      node_id: inserted.node_id,
      body: inserted.body,
      created_at: inserted.created_at,
      revision_id: inserted.revision_id,
      author: { id: req.user.id, name: req.user.name },
    },
  });
});

commentsRouter.delete('/comments/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const c = getComment.get(id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  if (c.author_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  softDelete.run(id);
  res.status(204).end();
});
