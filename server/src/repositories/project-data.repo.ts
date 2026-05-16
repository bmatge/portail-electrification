import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';

export interface ProjectDataRead {
  readonly json_value: string;
  readonly updated_at: string;
}

export async function getProjectData(
  k: Kdb,
  projectId: number,
  key: string,
): Promise<ProjectDataRead | undefined> {
  const row = await k
    .selectFrom('project_data')
    .select(['json_value', 'updated_at'])
    .where('project_id', '=', projectId)
    .where('key', '=', key)
    .executeTakeFirst();
  return row ?? undefined;
}

export async function listProjectDataRows(
  k: Kdb,
  projectId: number,
): Promise<readonly { readonly key: string; readonly json_value: string }[]> {
  return await k
    .selectFrom('project_data')
    .select(['key', 'json_value'])
    .where('project_id', '=', projectId)
    .execute();
}

// Upsert avec last-write-wins (utilisé par PUT /data/:key).
export async function upsertProjectData(
  k: Kdb,
  projectId: number,
  key: string,
  jsonValue: string,
  updatedBy: number,
): Promise<void> {
  await k
    .insertInto('project_data')
    .values({
      project_id: projectId,
      key,
      json_value: jsonValue,
      updated_by: updatedBy,
      updated_at: sql<string>`datetime('now')`,
    })
    .onConflict((oc) =>
      oc.columns(['project_id', 'key']).doUpdateSet({
        json_value: sql`excluded.json_value`,
        updated_by: sql`excluded.updated_by`,
        updated_at: sql`excluded.updated_at`,
      }),
    )
    .execute();
}

// Idempotent : préserve la valeur existante (utilisé par le seed).
export async function insertProjectDataIfMissing(
  k: Kdb,
  projectId: number,
  key: string,
  jsonValue: string,
  updatedBy: number,
): Promise<void> {
  await k
    .insertInto('project_data')
    .values({ project_id: projectId, key, json_value: jsonValue, updated_by: updatedBy })
    .onConflict((oc) => oc.columns(['project_id', 'key']).doNothing())
    .execute();
}

// Force la valeur (utilisé par l'import + createProject : sait qu'on est sur
// un projet fraîchement créé donc remplace sans risque de perdre du contenu
// utilisateur).
export async function replaceProjectData(
  k: Kdb,
  projectId: number,
  key: string,
  jsonValue: string,
  updatedBy: number,
): Promise<void> {
  await k
    .insertInto('project_data')
    .values({ project_id: projectId, key, json_value: jsonValue, updated_by: updatedBy })
    .onConflict((oc) =>
      oc.columns(['project_id', 'key']).doUpdateSet({
        json_value: sql`excluded.json_value`,
        updated_by: sql`excluded.updated_by`,
      }),
    )
    .execute();
}
