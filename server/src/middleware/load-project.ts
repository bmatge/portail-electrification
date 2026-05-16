import type { RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { getProjectBySlug } from '../repositories/project.repo.js';
import { NotFoundError } from '../domain/errors.js';

export function makeLoadProject(db: Db): RequestHandler {
  return (req, _res, next) => {
    const slug = req.params['slug'];
    if (typeof slug !== 'string' || slug.length === 0) {
      next(new NotFoundError('project_not_found'));
      return;
    }
    const project = getProjectBySlug(db, slug);
    if (!project) {
      next(new NotFoundError('project_not_found'));
      return;
    }
    req.project = project;
    next();
  };
}
