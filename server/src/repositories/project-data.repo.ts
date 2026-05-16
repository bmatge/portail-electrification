import type { Db } from '../db/client.js';
import type { ProjectDataRow } from '../db/types.js';

export function getProjectData(db: Db, projectId: number, key: string): ProjectDataRow | undefined {
  return db
    .prepare('SELECT json_value, updated_at FROM project_data WHERE project_id = ? AND key = ?')
    .get(projectId, key) as ProjectDataRow | undefined;
}

export function listProjectDataRows(
  db: Db,
  projectId: number,
): readonly { readonly key: string; readonly json_value: string }[] {
  return db
    .prepare('SELECT key, json_value FROM project_data WHERE project_id = ?')
    .all(projectId) as readonly { key: string; json_value: string }[];
}

// Upsert avec last-write-wins (utilisé par PUT /data/:key).
export function upsertProjectData(
  db: Db,
  projectId: number,
  key: string,
  jsonValue: string,
  updatedBy: number,
): void {
  db.prepare(
    `INSERT INTO project_data (project_id, key, json_value, updated_by, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, key) DO UPDATE
       SET json_value = excluded.json_value,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
  ).run(projectId, key, jsonValue, updatedBy);
}

// Idempotent : préserve la valeur existante (utilisé par le seed + l'import).
export function insertProjectDataIfMissing(
  db: Db,
  projectId: number,
  key: string,
  jsonValue: string,
  updatedBy: number,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO project_data (project_id, key, json_value, updated_by)
     VALUES (?, ?, ?, ?)`,
  ).run(projectId, key, jsonValue, updatedBy);
}

// Force la valeur (utilisé par l'import avec REPLACE — l'import est non-destructif
// au niveau du slug grâce à `findFreeSlug`, mais une fois le projet créé, les
// clés écrites pendant la transaction sont autoritaires).
export function replaceProjectData(
  db: Db,
  projectId: number,
  key: string,
  jsonValue: string,
  updatedBy: number,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO project_data (project_id, key, json_value, updated_by)
     VALUES (?, ?, ?, ?)`,
  ).run(projectId, key, jsonValue, updatedBy);
}
