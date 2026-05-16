import { api } from './client.js';

export interface ProjectListItem {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly created_at: string;
  readonly created_by: number | null;
  readonly is_public: boolean;
  readonly revision_count: number;
}

export interface ProjectDetail {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly created_at: string;
  readonly created_by: number | null;
  readonly is_public: boolean;
}

export async function listProjects(): Promise<readonly ProjectListItem[]> {
  const res = await api.get('/projects');
  return (res.data as { projects: readonly ProjectListItem[] }).projects;
}

export async function getProject(slug: string): Promise<ProjectDetail> {
  const res = await api.get(`/projects/${encodeURIComponent(slug)}`);
  return (res.data as { project: ProjectDetail }).project;
}

export interface CreateProjectInput {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectListItem> {
  const res = await api.post('/projects', input);
  return (res.data as { project: ProjectListItem }).project;
}

export async function setProjectVisibility(
  slug: string,
  isPublic: boolean,
): Promise<ProjectDetail> {
  const res = await api.patch(`/projects/${encodeURIComponent(slug)}`, { is_public: isPublic });
  return (res.data as { project: ProjectDetail }).project;
}

export async function exportProjectBundle(slug: string): Promise<unknown> {
  const res = await api.get(`/projects/${encodeURIComponent(slug)}/export`);
  return res.data;
}

export async function deleteProject(slug: string): Promise<void> {
  await api.delete(`/projects/${encodeURIComponent(slug)}`);
}

export async function importProjectBundle(
  bundle: unknown,
  slug?: string,
): Promise<ProjectListItem> {
  const body: { bundle: unknown; slug?: string } = { bundle };
  if (slug) body.slug = slug;
  const res = await api.post('/projects/import', body);
  return (res.data as { project: ProjectListItem }).project;
}
