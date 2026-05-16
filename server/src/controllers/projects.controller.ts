import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { ensureSystemUser } from '../repositories/user.repo.js';
import {
  createProject,
  deleteProject,
  exportProjectBundle,
  findProjectBySlug,
  importProjectFromBundle,
  listProjects,
} from '../services/project.service.js';
import { NotFoundError, UnauthorizedError } from '../domain/errors.js';
import type { CreateProjectBody, ImportProjectBody } from '../schemas/project.schemas.js';

export function makeProjectsController(db: Db): {
  list: RequestHandler;
  importBundle: RequestHandler;
  show: RequestHandler;
  remove: RequestHandler;
  exportBundle: RequestHandler;
  create: RequestHandler;
} {
  return {
    list(_req, res) {
      res.json({ projects: listProjects(db) });
    },
    importBundle(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      const body = req.body as ImportProjectBody;
      const sysUser = ensureSystemUser(db);
      try {
        const result = importProjectFromBundle(db, {
          bundle: body.bundle,
          sysUserId: sysUser.id ?? req.user.id,
          ...(body.slug !== undefined && body.slug !== '' ? { slugOverride: body.slug } : {}),
        });
        res.status(201).json({
          project: result.project,
          slug_was_renamed: result.slugWasRenamed,
          final_slug: result.finalSlug,
        });
      } catch (e) {
        next(e);
      }
    },
    show(req, res, next) {
      const slug = req.params['slug'];
      if (typeof slug !== 'string') return next(new NotFoundError('project_not_found'));
      const project = findProjectBySlug(db, slug);
      if (!project) return next(new NotFoundError('project_not_found'));
      res.json({ project });
    },
    remove(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      const slug = req.params['slug'];
      if (typeof slug !== 'string') return next(new NotFoundError('project_not_found'));
      const project = findProjectBySlug(db, slug);
      if (!project) return next(new NotFoundError('project_not_found'));
      try {
        const changes = deleteProject(db, project.id);
        if (changes === 0) return next(new NotFoundError('project_not_found'));
        res.json({
          ok: true,
          deleted: { id: project.id, slug: project.slug, name: project.name },
        });
      } catch (e) {
        next(e);
      }
    },
    exportBundle(req, res, next) {
      const slug = req.params['slug'];
      if (typeof slug !== 'string') return next(new NotFoundError('project_not_found'));
      const project = findProjectBySlug(db, slug);
      if (!project) return next(new NotFoundError('project_not_found'));
      const bundle = exportProjectBundle(db, project.id);
      const filename = `projet-${project.slug}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(bundle, null, 2));
    },
    create(req, res, next) {
      if (!req.user) return next(new UnauthorizedError());
      const body = req.body as CreateProjectBody;
      try {
        const project = createProject(db, {
          slug: body.slug,
          name: body.name,
          description: body.description,
        });
        res.status(201).json({ project });
      } catch (e) {
        next(e);
      }
    },
  };
}
