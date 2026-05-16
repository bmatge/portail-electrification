import { sql } from 'kysely';
import type { Kdb } from '../db/client.js';
import type { Project, ProjectListItem } from '../db/types.js';
import {
  deleteCommentsForProject,
  deleteProjectRow,
  deleteRevisionsForProject,
  deleteRoadmapRevisionsForProject,
  getProjectById,
  getProjectBySlug,
  insertProject,
  listProjects as repoListProjects,
} from '../repositories/project.repo.js';
import { listProjectDataRows, replaceProjectData } from '../repositories/project-data.repo.js';
import { getHeadRevision, insertRevision } from '../repositories/revision.repo.js';
import {
  getHeadRoadmapRevision,
  insertRoadmapRevision,
} from '../repositories/roadmap-revision.repo.js';
import { ensureSystemUser } from '../repositories/user.repo.js';
import { DEFAULT_DRUPAL_STRUCTURE, DEFAULT_VOCAB } from './seed.service.js';
import { AppError, NotFoundError, ValidationError } from '../domain/errors.js';
import { logAudit } from './audit.service.js';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EXPORT_KEYS = ['dispositifs', 'mesures', 'objectifs', 'drupal_structure', 'vocab'] as const;

export function listProjects(k: Kdb): Promise<readonly ProjectListItem[]> {
  return repoListProjects(k);
}

export function findProjectBySlug(k: Kdb, slug: string): Promise<Project | undefined> {
  return getProjectBySlug(k, slug);
}

export interface CreateProjectInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly actorId: number;
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function createProject(k: Kdb, input: CreateProjectInput): Promise<Project> {
  const sysUser = await ensureSystemUser(k);
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const description = (input.description ?? '').trim().slice(0, 500);

  if (!name) throw new ValidationError('name_required');
  if (!slug || !SLUG_RE.test(slug)) {
    throw new ValidationError(
      'invalid_slug',
      '2-50 chars : a-z, 0-9, tirets ; commence et finit par alphanum.',
    );
  }
  if (await getProjectBySlug(k, slug)) {
    throw new AppError(409, 'slug_taken');
  }

  const id = await k.transaction().execute(async (trx) => {
    const projectId = await insertProject(trx, { slug, name, description });
    await insertRevision(trx, {
      projectId,
      parentId: null,
      treeJson: JSON.stringify({ id: 'root', label: name, type: 'hub', tldr: '', children: [] }),
      authorId: sysUser.id,
      message: 'Création du projet',
    });
    await insertRoadmapRevision(trx, {
      projectId,
      parentId: null,
      dataJson: JSON.stringify({ meta: {}, items: [] }),
      authorId: sysUser.id,
      message: 'Création du projet',
    });
    const seeds: ReadonlyArray<readonly [string, unknown]> = [
      ['dispositifs', { dispositifs: [] }],
      ['mesures', { mesures: [] }],
      ['objectifs', { axes: [], objectives: [], means: [] }],
      ['drupal_structure', DEFAULT_DRUPAL_STRUCTURE],
      ['vocab', DEFAULT_VOCAB],
    ];
    for (const [key, value] of seeds) {
      await replaceProjectData(trx, projectId, key, JSON.stringify(value), sysUser.id);
    }
    return projectId;
  });

  const project = await getProjectById(k, id);
  if (!project) throw new AppError(500, 'create_failed');
  await logAudit(k, 'project.create', {
    actorId: input.actorId,
    projectId: project.id,
    resourceType: 'project',
    resourceId: project.id,
    details: { slug: project.slug, name: project.name },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return project;
}

export interface DeleteProjectInput {
  readonly projectId: number;
  readonly actorId: number;
  readonly ip?: string;
  readonly userAgent?: string;
}

export async function deleteProject(k: Kdb, input: DeleteProjectInput): Promise<number> {
  const project = await getProjectById(k, input.projectId);
  const changes = await k.transaction().execute(async (trx) => {
    await sql`PRAGMA defer_foreign_keys = ON`.execute(trx);
    await deleteCommentsForProject(trx, input.projectId);
    await deleteRevisionsForProject(trx, input.projectId);
    await deleteRoadmapRevisionsForProject(trx, input.projectId);
    return await deleteProjectRow(trx, input.projectId);
  });
  if (changes > 0 && project) {
    await logAudit(k, 'project.delete', {
      actorId: input.actorId,
      projectId: null,
      resourceType: 'project',
      resourceId: project.id,
      details: { slug: project.slug, name: project.name },
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }
  return changes;
}

export interface ProjectBundle {
  readonly version: 1;
  readonly exported_at: string;
  readonly project: {
    readonly slug: string;
    readonly name: string;
    readonly description: string;
  };
  readonly tree: unknown;
  readonly roadmap: unknown;
  readonly data: Readonly<Record<string, unknown>>;
}

export async function exportProjectBundle(
  k: Kdb,
  projectId: number,
): Promise<ProjectBundle | null> {
  const project = await getProjectById(k, projectId);
  if (!project) return null;
  const head = await getHeadRevision(k, projectId);
  const roadmapHead = await getHeadRoadmapRevision(k, projectId);
  const dataRows = await listProjectDataRows(k, projectId);
  const data: Record<string, unknown> = {};
  for (const row of dataRows) {
    if ((EXPORT_KEYS as readonly string[]).includes(row.key)) {
      data[row.key] = JSON.parse(row.json_value);
    }
  }
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    project: {
      slug: project.slug,
      name: project.name,
      description: project.description || '',
    },
    tree: head ? (JSON.parse(head.tree_json) as unknown) : null,
    roadmap: roadmapHead ? (JSON.parse(roadmapHead.data_json) as unknown) : { meta: {}, items: [] },
    data,
  };
}

export interface ImportBundleInput {
  readonly bundle: unknown;
  readonly sysUserId: number;
  readonly actorId: number;
  readonly slugOverride?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface ImportResult {
  readonly project: Project;
  readonly slugWasRenamed: boolean;
  readonly finalSlug: string;
}

interface BundleLike {
  readonly project?: {
    readonly slug?: unknown;
    readonly name?: unknown;
    readonly description?: unknown;
  };
  readonly tree?: unknown;
  readonly roadmap?: unknown;
  readonly data?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function findFreeSlug(k: Kdb, base: string): Promise<string> {
  if (!(await getProjectBySlug(k, base))) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 50);
    if (!(await getProjectBySlug(k, candidate))) return candidate;
  }
  throw new AppError(500, 'create_failed', 'Impossible de générer un slug libre');
}

export async function importProjectFromBundle(
  k: Kdb,
  input: ImportBundleInput,
): Promise<ImportResult> {
  if (!isPlainObject(input.bundle)) throw new AppError(400, 'bundle_invalid');
  const bundle = input.bundle as BundleLike;
  const meta = isPlainObject(bundle.project) ? bundle.project : {};

  const rawSlug = String(input.slugOverride ?? meta.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  if (!rawSlug || !SLUG_RE.test(rawSlug)) {
    throw new AppError(400, 'bundle_slug_invalid');
  }
  const name = String(meta.name ?? rawSlug)
    .trim()
    .slice(0, 100);
  const description = String(meta.description ?? '')
    .trim()
    .slice(0, 500);

  const tree =
    isPlainObject(bundle.tree) && typeof bundle.tree['id'] === 'string'
      ? bundle.tree
      : { id: 'root', label: name, type: 'hub', tldr: '', children: [] };

  const roadmap =
    isPlainObject(bundle.roadmap) && Array.isArray(bundle.roadmap['items'])
      ? bundle.roadmap
      : { meta: {}, items: [] };

  const dataBundle = isPlainObject(bundle.data) ? bundle.data : {};

  const finalSlug = await findFreeSlug(k, rawSlug);
  const slugWasRenamed = finalSlug !== rawSlug;

  const projectId = await k.transaction().execute(async (trx) => {
    const id = await insertProject(trx, { slug: finalSlug, name, description });
    await insertRevision(trx, {
      projectId: id,
      parentId: null,
      treeJson: JSON.stringify(tree),
      authorId: input.sysUserId,
      message: 'Import du projet',
    });
    await insertRoadmapRevision(trx, {
      projectId: id,
      parentId: null,
      dataJson: JSON.stringify(roadmap),
      authorId: input.sysUserId,
      message: 'Import du projet',
    });

    const fallbacks: Readonly<Record<string, unknown>> = {
      dispositifs: { dispositifs: [] },
      mesures: { mesures: [] },
      objectifs: { axes: [], objectives: [], means: [] },
      drupal_structure: DEFAULT_DRUPAL_STRUCTURE,
      vocab: DEFAULT_VOCAB,
    };
    for (const key of EXPORT_KEYS) {
      const provided = dataBundle[key];
      const value = isPlainObject(provided) ? provided : fallbacks[key];
      await replaceProjectData(trx, id, key, JSON.stringify(value), input.sysUserId);
    }
    return id;
  });

  const project = await getProjectById(k, projectId);
  if (!project) throw new NotFoundError('project_not_found');
  await logAudit(k, 'project.import', {
    actorId: input.actorId,
    projectId: project.id,
    resourceType: 'project',
    resourceId: project.id,
    details: { slug: project.slug, name: project.name, slugWasRenamed },
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { project, slugWasRenamed, finalSlug };
}
