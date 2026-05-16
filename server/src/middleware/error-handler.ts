import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ConflictError } from '../domain/errors.js';

interface ErrorBody {
  error: string;
  detail?: string;
  issues?: unknown;
  head?: unknown;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ConflictError) {
    const body: ErrorBody = { error: err.code };
    if (err.head !== undefined) body.head = err.head;
    res.status(err.status).json(body);
    return;
  }
  if (err instanceof AppError) {
    const body: ErrorBody = { error: err.code };
    if (typeof err.message === 'string' && err.message !== err.code) {
      body.detail = err.message;
    }
    if (err.details !== undefined) body.issues = err.details;
    res.status(err.status).json(body);
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', issues: err.issues });
    return;
  }
  console.error(err);
  const body: ErrorBody = { error: 'internal_error' };
  if (err instanceof Error && err.message) body.detail = err.message;
  res.status(500).json(body);
};
