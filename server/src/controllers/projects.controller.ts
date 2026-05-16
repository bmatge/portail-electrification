import type { Request, RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { ensureSystemUser } from '../repositories/user.repo.js';
import {
  createProject,
  deleteProject,
  exportProjectBundle,
  findProjectBySlug,
  importProjectFromBundle,
  listProjects,
  updateProjectVisibility,
} from '../services/project.service.js';
import { NotFoundError, UnauthorizedError } from '../domain/errors.js';
import { asyncH } from '../middleware/async-handler.js';
import type {
  CreateProjectBody,
  ImportProjectBody,
  UpdateProjectBody,
} from '../schemas/project.schemas.js';

function clientIp(req: Request): string {
  return req.ip ?? '';
}

function clientUA(req: Request): string {
  return req.get('user-agent') ?? '';
}

export function makeProjectsController(k: Kdb): {
  list: RequestHandler;
  importBundle: RequestHandler;
  show: RequestHandler;
  remove: RequestHandler;
  exportBundle: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
} {
  return {
    list: asyncH(async (req, res) => {
      const viewer = req.user ? { userId: req.user.id, grants: req.user.roles } : null;
      res.json({ projects: await listProjects(k, viewer) });
    }),
    importBundle: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      const body = req.body as ImportProjectBody;
      const sysUser = await ensureSystemUser(k);
      const result = await importProjectFromBundle(k, {
        bundle: body.bundle,
        sysUserId: sysUser.id ?? req.user.id,
        actorId: req.user.id,
        ip: clientIp(req),
        userAgent: clientUA(req),
        ...(body.slug !== undefined && body.slug !== '' ? { slugOverride: body.slug } : {}),
      });
      res.status(201).json({
        project: result.project,
        slug_was_renamed: result.slugWasRenamed,
        final_slug: result.finalSlug,
      });
    }),
    show: asyncH(async (req, res) => {
      const slug = req.params['slug'];
      if (typeof slug !== 'string') throw new NotFoundError('project_not_found');
      const project = await findProjectBySlug(k, slug);
      if (!project) throw new NotFoundError('project_not_found');
      res.json({ project });
    }),
    remove: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      const slug = req.params['slug'];
      if (typeof slug !== 'string') throw new NotFoundError('project_not_found');
      const project = await findProjectBySlug(k, slug);
      if (!project) throw new NotFoundError('project_not_found');
      const changes = await deleteProject(k, {
        projectId: project.id,
        actorId: req.user.id,
        actorGrants: req.user.roles,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      if (changes === 0) throw new NotFoundError('project_not_found');
      res.json({
        ok: true,
        deleted: { id: project.id, slug: project.slug, name: project.name },
      });
    }),
    exportBundle: asyncH(async (req, res) => {
      const slug = req.params['slug'];
      if (typeof slug !== 'string') throw new NotFoundError('project_not_found');
      const project = await findProjectBySlug(k, slug);
      if (!project) throw new NotFoundError('project_not_found');
      const bundle = await exportProjectBundle(k, project.id);
      const filename = `projet-${project.slug}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(bundle, null, 2));
    }),
    create: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      const body = req.body as CreateProjectBody;
      const project = await createProject(k, {
        slug: body.slug,
        name: body.name,
        description: body.description,
        actorId: req.user.id,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.status(201).json({ project });
    }),
    update: asyncH(async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      if (!req.project) throw new NotFoundError('project_not_found');
      const body = req.body as UpdateProjectBody;
      const project = await updateProjectVisibility(k, {
        projectId: req.project.id,
        isPublic: body.is_public,
        actorId: req.user.id,
        ip: clientIp(req),
        userAgent: clientUA(req),
      });
      res.json({ project });
    }),
  };
}
