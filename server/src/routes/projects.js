import { Router } from 'express';
import { listProjects, getProjectBySlug, createProject } from '../db.js';
import { requireUser } from '../auth.js';

export const projectsRouter = Router();

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

projectsRouter.get('/projects', (_req, res) => {
  res.json({ projects: listProjects() });
});

projectsRouter.get('/projects/:slug', (req, res) => {
  const project = getProjectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  res.json({ project });
});

projectsRouter.post('/projects', requireUser, (req, res) => {
  const slug = String(req.body?.slug || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim().slice(0, 500);
  if (!name) return res.status(400).json({ error: 'name_required' });
  if (!slug || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'invalid_slug', detail: '2-50 chars : a-z, 0-9, tirets ; commence et finit par alphanum.' });
  }
  if (getProjectBySlug(slug)) {
    return res.status(409).json({ error: 'slug_taken' });
  }
  try {
    const project = createProject({ slug, name, description });
    res.status(201).json({ project });
  } catch (e) {
    res.status(500).json({ error: 'create_failed', detail: e.message });
  }
});

// Middleware : résout req.project depuis :slug et le rend disponible pour
// tous les routeurs imbriqués (tree, roadmap, comments, data...).
export function loadProject(req, res, next) {
  const project = getProjectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  req.project = project;
  next();
}
