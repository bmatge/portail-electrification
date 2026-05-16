import type { Db } from '../db/client.js';
import { ValidationError } from '../domain/errors.js';
import { getProjectData, upsertProjectData } from '../repositories/project-data.repo.js';

const KEYS = new Set(['dispositifs', 'mesures', 'objectifs', 'drupal_structure', 'vocab']);

function assertValidKey(key: string): void {
  if (!KEYS.has(key)) throw new ValidationError('invalid_key');
}

export interface DataReadResult {
  readonly data: unknown;
  readonly updated_at: string | null;
}

export function readProjectData(db: Db, projectId: number, key: string): DataReadResult {
  assertValidKey(key);
  const row = getProjectData(db, projectId, key);
  if (!row) return { data: null, updated_at: null };
  return { data: JSON.parse(row.json_value), updated_at: row.updated_at };
}

export function writeProjectData(
  db: Db,
  projectId: number,
  key: string,
  data: unknown,
  updatedBy: number,
): void {
  assertValidKey(key);
  if (data === undefined) throw new ValidationError('data_required');
  upsertProjectData(db, projectId, key, JSON.stringify(data), updatedBy);
}
