import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../domain/errors.js';

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  next();
};
