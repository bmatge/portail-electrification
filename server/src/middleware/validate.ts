import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ValidationError } from '../domain/errors.js';

// Valide req.body via un schéma Zod. Le body parsé remplace req.body pour que
// les controllers récupèrent un type strict. Lève ValidationError sur échec
// (interceptée par le middleware error-handler).
export function validateBody<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError('validation_error', 'invalid body', result.error.issues));
      return;
    }
    req.body = result.data as unknown as z.infer<S>;
    next();
  };
}

export function validateQuery<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError('validation_error', 'invalid query', result.error.issues));
      return;
    }
    // req.query est getter-only sur Express 5 ; on défère le typage côté handler
    // via une assertion locale plutôt qu'une mutation.
    next();
  };
}
