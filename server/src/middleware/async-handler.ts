// Wrapper minimal pour propager les erreurs async vers le middleware
// `errorHandler`. Express 4 ne le fait pas nativement (Express 5, oui).

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

export function asyncH(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
