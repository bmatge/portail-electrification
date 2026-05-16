import { api } from './client.js';

export interface RevisionSummary {
  readonly id: number;
  readonly parent_id: number | null;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
  readonly author: { readonly id: number; readonly name: string };
}

export interface TreeHead {
  readonly revision: RevisionSummary;
  readonly tree: unknown;
}

export async function getTree(slug: string): Promise<TreeHead> {
  const res = await api.get(`/projects/${encodeURIComponent(slug)}/tree`);
  return res.data as TreeHead;
}

export async function saveTree(
  slug: string,
  tree: unknown,
  ifMatch: number,
  message = '',
): Promise<{ revision: RevisionSummary }> {
  const res = await api.put(
    `/projects/${encodeURIComponent(slug)}/tree`,
    { tree, message },
    { headers: { 'If-Match': String(ifMatch) } },
  );
  return res.data as { revision: RevisionSummary };
}

export async function getRoadmap(slug: string): Promise<{
  revision: RevisionSummary;
  roadmap: unknown;
}> {
  const res = await api.get(`/projects/${encodeURIComponent(slug)}/roadmap`);
  return res.data as { revision: RevisionSummary; roadmap: unknown };
}

export async function saveRoadmap(
  slug: string,
  roadmap: unknown,
  ifMatch: number,
  message = '',
): Promise<{ revision: RevisionSummary }> {
  const res = await api.put(
    `/projects/${encodeURIComponent(slug)}/roadmap`,
    { roadmap, message },
    { headers: { 'If-Match': String(ifMatch) } },
  );
  return res.data as { revision: RevisionSummary };
}

export async function getData(
  slug: string,
  key: string,
): Promise<{ data: unknown; updated_at: string | null }> {
  const res = await api.get(
    `/projects/${encodeURIComponent(slug)}/data/${encodeURIComponent(key)}`,
  );
  return res.data as { data: unknown; updated_at: string | null };
}

export async function saveData(slug: string, key: string, data: unknown): Promise<void> {
  await api.put(`/projects/${encodeURIComponent(slug)}/data/${encodeURIComponent(key)}`, { data });
}
