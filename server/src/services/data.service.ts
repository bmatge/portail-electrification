import type { Kdb } from '../db/client.js';
import { ValidationError } from '../domain/errors.js';
import { getProjectData, upsertProjectData } from '../repositories/project-data.repo.js';
import { logAudit } from './audit.service.js';

const KEYS = new Set(['dispositifs', 'mesures', 'objectifs', 'drupal_structure', 'vocab']);

function assertValidKey(key: string): void {
  if (!KEYS.has(key)) throw new ValidationError('invalid_key');
}

export interface DataReadResult {
  readonly data: unknown;
  readonly updated_at: string | null;
}

export async function readProjectData(
  k: Kdb,
  projectId: number,
  key: string,
): Promise<DataReadResult> {
  assertValidKey(key);
  const row = await getProjectData(k, projectId, key);
  if (!row) return { data: null, updated_at: null };
  return { data: JSON.parse(row.json_value), updated_at: row.updated_at };
}

export interface WriteDataInput {
  readonly projectId: number;
  readonly key: string;
  readonly data: unknown;
  readonly actorId: number;
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function writeProjectData(k: Kdb, input: WriteDataInput): Promise<void> {
  assertValidKey(input.key);
  if (input.data === undefined) throw new ValidationError('data_required');
  await upsertProjectData(k, input.projectId, input.key, JSON.stringify(input.data), input.actorId);
  await logAudit(k, 'data.write', {
    actorId: input.actorId,
    projectId: input.projectId,
    resourceType: 'project_data',
    resourceId: input.key,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
