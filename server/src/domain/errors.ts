// Hiérarchie d'erreurs métier. Chaque AppError porte un code stable utilisé
// dans le JSON renvoyé au client (`{ error: code }`) ; le mapping vers le
// status HTTP est fait par le middleware `error-handler`. Permet aux routes
// et services de lever des erreurs typées sans dépendre d'Express.

export type ErrorCode =
  | 'internal_error'
  | 'identification_required'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_error'
  | 'rate_limited'
  | 'invalid_tree'
  | 'invalid_roadmap'
  | 'invalid_id'
  | 'invalid_key'
  | 'invalid_slug'
  | 'name_required'
  | 'name_too_long'
  | 'node_id_required'
  | 'body_required'
  | 'body_too_long'
  | 'slug_taken'
  | 'no_revision'
  | 'project_not_found'
  | 'bundle_required'
  | 'bundle_invalid'
  | 'bundle_slug_invalid'
  | 'import_failed'
  | 'create_failed'
  | 'delete_failed'
  | 'data_required';

export interface AppErrorPayload {
  readonly status: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(code: ErrorCode = 'validation_error', message?: string, details?: unknown) {
    super(400, code, message, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(code: ErrorCode = 'identification_required', message?: string) {
    super(401, code, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(code: ErrorCode = 'forbidden', message?: string) {
    super(403, code, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(code: ErrorCode = 'not_found', message?: string) {
    super(404, code, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  readonly head: unknown;
  constructor(code: ErrorCode = 'conflict', message?: string, head?: unknown) {
    super(409, code, message, head);
    this.head = head;
    this.name = 'ConflictError';
  }
}
