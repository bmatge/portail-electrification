import { Router } from 'express';
import { db, getHeadRevision } from '../db.js';
import { requireUser } from '../auth.js';

// mergeParams = true pour récupérer :slug du parent, et req.project posé par loadProject.
export const treeRouter = Router({ mergeParams: true });

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

treeRouter.get('/tree', (req, res) => {
  const head = getHeadRevision(req.project.id);
  if (!head) return res.status(404).json({ error: 'no_revision' });
  res.json({
    revision: serializeRevision(head),
    tree: JSON.parse(head.tree_json),
  });
});

const insertRevision = db.prepare(`
  INSERT INTO revisions (project_id, parent_id, tree_json, author_id, message)
  VALUES (?, ?, ?, ?, ?)
  RETURNING id, parent_id, message, created_at, reverts_id, author_id
`);

treeRouter.put('/tree', requireUser, (req, res) => {
  const { tree, message } = req.body || {};
  if (!tree || typeof tree !== 'object' || !tree.id) {
    return res.status(400).json({ error: 'invalid_tree' });
  }

  const head = getHeadRevision(req.project.id);
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
  const inserted = insertRevision.get(req.project.id, parentId, JSON.stringify(tree), req.user.id, msg);
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
