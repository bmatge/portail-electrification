import type { Db } from '../db/client.js';
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

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EXPORT_KEYS = ['dispositifs', 'mesures', 'objectifs', 'drupal_structure', 'vocab'] as const;

export function listProjects(db: Db): readonly ProjectListItem[] {
  return repoListProjects(db);
}

export function findProjectBySlug(db: Db, slug: string): Project | undefined {
  return getProjectBySlug(db, slug);
}

export interface CreateProjectInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
}

export function createProject(db: Db, input: CreateProjectInput): Project {
  const sysUser = ensureSystemUser(db);
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
  if (getProjectBySlug(db, slug)) {
    throw new AppError(409, 'slug_taken');
  }

  const tx = db.transaction((): number => {
    const projectId = insertProject(db, { slug, name, description });
    insertRevision(db, {
      projectId,
      parentId: null,
      treeJson: JSON.stringify({ id: 'root', label: name, type: 'hub', tldr: '', children: [] }),
      authorId: sysUser.id,
      message: 'Création du projet',
    });
    insertRoadmapRevision(db, {
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
      replaceProjectData(db, projectId, key, JSON.stringify(value), sysUser.id);
    }
    return projectId;
  });

  const id = tx();
  const project = getProjectById(db, id);
  if (!project) throw new AppError(500, 'create_failed');
  return project;
}

export function deleteProject(db: Db, projectId: number): number {
  const tx = db.transaction((): number => {
    db.pragma('defer_foreign_keys = ON');
    deleteCommentsForProject(db, projectId);
    deleteRevisionsForProject(db, projectId);
    deleteRoadmapRevisionsForProject(db, projectId);
    // project_data : supprimé via ON DELETE CASCADE quand on supprime le projet.
    return deleteProjectRow(db, projectId);
  });
  return tx();
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

export function exportProjectBundle(db: Db, projectId: number): ProjectBundle | null {
  const project = getProjectById(db, projectId);
  if (!project) return null;
  const head = getHeadRevision(db, projectId);
  const roadmapHead = getHeadRoadmapRevision(db, projectId);
  const data: Record<string, unknown> = {};
  for (const row of listProjectDataRows(db, projectId)) {
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
  readonly slugOverride?: string;
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

function findFreeSlug(db: Db, base: string): string {
  if (!getProjectBySlug(db, base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 50);
    if (!getProjectBySlug(db, candidate)) return candidate;
  }
  throw new AppError(500, 'create_failed', 'Impossible de générer un slug libre');
}

export function importProjectFromBundle(db: Db, input: ImportBundleInput): ImportResult {
  if (!isPlainObject(input.bundle)) {
    throw new AppError(400, 'bundle_invalid');
  }
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

  const finalSlug = findFreeSlug(db, rawSlug);
  const slugWasRenamed = finalSlug !== rawSlug;

  const tx = db.transaction((): number => {
    const projectId = insertProject(db, { slug: finalSlug, name, description });
    insertRevision(db, {
      projectId,
      parentId: null,
      treeJson: JSON.stringify(tree),
      authorId: input.sysUserId,
      message: 'Import du projet',
    });
    insertRoadmapRevision(db, {
      projectId,
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
      replaceProjectData(db, projectId, key, JSON.stringify(value), input.sysUserId);
    }
    return projectId;
  });

  const projectId = tx();
  const project = getProjectById(db, projectId);
  if (!project) throw new NotFoundError('project_not_found');
  return { project, slugWasRenamed, finalSlug };
}
