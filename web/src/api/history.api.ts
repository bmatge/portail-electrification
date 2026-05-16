import { api } from './client.js';

export interface RevisionEntry {
  readonly id: number;
  readonly parent_id: number | null;
  readonly message: string;
  readonly created_at: string;
  readonly reverts_id: number | null;
  readonly author: { readonly id: number; readonly name: string };
}

export async function listHistory(slug: string): Promise<readonly RevisionEntry[]> {
  const res = await api.get(`/projects/${encodeURIComponent(slug)}/history`);
  return (res.data as { revisions?: readonly RevisionEntry[] }).revisions ?? [];
}

export async function getRevision(
  slug: string,
  id: number,
): Promise<{ revision: RevisionEntry; tree: unknown }> {
  const res = await api.get(`/projects/${encodeURIComponent(slug)}/revisions/${id}`);
  return res.data as { revision: RevisionEntry; tree: unknown };
}

export async function revertToRevision(
  slug: string,
  id: number,
  message = '',
): Promise<RevisionEntry> {
  const res = await api.post(`/projects/${encodeURIComponent(slug)}/revisions/${id}/revert`, {
    message,
  });
  return (res.data as { revision: RevisionEntry }).revision;
}
