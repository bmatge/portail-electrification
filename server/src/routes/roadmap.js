import { Router } from 'express';
import { db, getRoadmapHeadRevision } from '../db.js';
import { requireUser } from '../auth.js';

export const roadmapRouter = Router();

function serializeRevision(row) {
  return {
    id: row.id,
    parent_id: row.parent_id,
    message: row.message,
    created_at: row.created_at,
    reverts_id: row.reverts_id,
    author: { id: row.author_id, name: row.author_name },
  };
}

roadmapRouter.get('/roadmap', (_req, res) => {
  const head = getRoadmapHeadRevision();
  if (!head) return res.status(404).json({ error: 'no_revision' });
  res.json({
    revision: serializeRevision(head),
    roadmap: JSON.parse(head.data_json),
  });
});

const insertRoadmapRevision = db.prepare(`
  INSERT INTO roadmap_revisions (parent_id, data_json, author_id, message)
  VALUES (?, ?, ?, ?)
  RETURNING id, parent_id, message, created_at, reverts_id, author_id
`);

roadmapRouter.put('/roadmap', requireUser, (req, res) => {
  const { roadmap, message } = req.body || {};
  if (!roadmap || typeof roadmap !== 'object' || !Array.isArray(roadmap.items)) {
    return res.status(400).json({ error: 'invalid_roadmap' });
  }

  const head = getRoadmapHeadRevision();
  const expectedParent = req.get('If-Match');
  if (expectedParent !== undefined && expectedParent !== '' && head &&
      String(head.id) !== String(expectedParent)) {
    return res.status(409).json({
      error: 'conflict',
      head: serializeRevision(head),
    });
  }

  const parentId = head ? head.id : null;
  const msg = String(message || '').slice(0, 200);
  const inserted = insertRoadmapRevision.get(parentId, JSON.stringify(roadmap), req.user.id, msg);
  res.json({
    revision: {
      id: inserted.id,
      parent_id: inserted.parent_id,
      message: inserted.message,
      created_at: inserted.created_at,
      reverts_id: inserted.reverts_id,
      author: { id: req.user.id, name: req.user.name },
    },
  });
});

const listRoadmapRevisions = db.prepare(`
  SELECT r.id, r.parent_id, r.message, r.created_at, r.reverts_id,
         u.id AS author_id, u.name AS author_name
  FROM roadmap_revisions r
  JOIN users u ON u.id = r.author_id
  ORDER BY r.id DESC
  LIMIT ?
`);

const getRoadmapRevision = db.prepare(`
  SELECT r.id, r.parent_id, r.data_json, r.message, r.created_at, r.reverts_id,
         u.id AS author_id, u.name AS author_name
  FROM roadmap_revisions r
  JOIN users u ON u.id = r.author_id
  WHERE r.id = ?
`);

roadmapRouter.get('/roadmap/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = listRoadmapRevisions.all(limit);
  const head = getRoadmapHeadRevision();
  res.json({
    head_id: head?.id ?? null,
    revisions: rows.map(serializeRevision),
  });
});

roadmapRouter.get('/roadmap/revisions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const row = getRoadmapRevision.get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({
    revision: serializeRevision(row),
    roadmap: JSON.parse(row.data_json),
  });
});
