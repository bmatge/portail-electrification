import { Router } from 'express';
import {
  listProjects, getProjectBySlug, createProject,
  exportProjectBundle, importProjectFromBundle, deleteProject, db,
} from '../db.js';
import { requireUser } from '../auth.js';

export const projectsRouter = Router();

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

projectsRouter.get('/projects', (_req, res) => {
  res.json({ projects: listProjects() });
});

// /!\ doit être déclaré AVANT la route `/projects/:slug` pour éviter que
// "import" soit interprété comme un slug. (En POST il n'y a pas de collision,
// mais on garde l'ordre par cohérence.)
projectsRouter.post('/projects/import', requireUser, (req, res) => {
  const { bundle, slug: slugOverride } = req.body || {};
  if (!bundle || typeof bundle !== 'object') {
    return res.status(400).json({ error: 'bundle_required' });
  }
  try {
    const sysRow = db.prepare('SELECT id FROM users WHERE name = ?').get('Système');
    const sysId = sysRow ? sysRow.id : req.user.id;
    const { project, slugWasRenamed, finalSlug } = importProjectFromBundle(bundle, sysId, { slugOverride });
    res.status(201).json({ project, slug_was_renamed: slugWasRenamed, final_slug: finalSlug });
  } catch (e) {
    const known = ['bundle_invalid', 'bundle_slug_invalid'];
    if (known.includes(e.message)) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: 'import_failed', detail: e.message });
  }
});

projectsRouter.get('/projects/:slug', (req, res) => {
  const project = getProjectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  res.json({ project });
});

// Suppression d'un projet. Demande une double confirmation côté front (saisie
// du nom du projet) ; côté serveur on exige simplement que l'utilisateur soit
// identifié et que le projet existe.
projectsRouter.delete('/projects/:slug', requireUser, (req, res) => {
  const project = getProjectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  try {
    const changes = deleteProject(project.id);
    if (changes === 0) return res.status(404).json({ error: 'project_not_found' });
    res.json({ ok: true, deleted: { id: project.id, slug: project.slug, name: project.name } });
  } catch (e) {
    res.status(500).json({ error: 'delete_failed', detail: e.message });
  }
});

projectsRouter.get('/projects/:slug/export', (req, res) => {
  const project = getProjectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  const bundle = exportProjectBundle(project.id);
  const filename = `projet-${project.slug}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(bundle, null, 2));
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
