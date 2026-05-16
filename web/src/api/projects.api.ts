import { api } from './client.js';

export interface ProjectListItem {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly created_at: string;
  readonly created_by: number | null;
  readonly revision_count: number;
}

export async function listProjects(): Promise<readonly ProjectListItem[]> {
  const res = await api.get('/projects');
  return (res.data as { projects: readonly ProjectListItem[] }).projects;
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
