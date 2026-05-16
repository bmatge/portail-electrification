import type { RequestHandler } from 'express';
import type { Kdb } from '../db/client.js';
import { getProjectBySlug } from '../repositories/project.repo.js';
import { NotFoundError } from '../domain/errors.js';

export function makeLoadProject(k: Kdb): RequestHandler {
  return (req, _res, next) => {
    const slug = req.params['slug'];
    if (typeof slug !== 'string' || slug.length === 0) {
      next(new NotFoundError('project_not_found'));
      return;
    }
    getProjectBySlug(k, slug)
      .then((project) => {
        if (!project) {
          next(new NotFoundError('project_not_found'));
          return;
        }
        req.project = project;
        next();
      })
      .catch(next);
  };
}
