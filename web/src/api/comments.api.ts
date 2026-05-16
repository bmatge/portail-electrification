import { api } from './client.js';

export interface Comment {
  readonly id: number;
  readonly node_id: string;
  readonly author_id: number;
  readonly author_name: string;
  readonly body: string;
  readonly created_at: string;
}

export async function listComments(slug: string, nodeId?: string): Promise<readonly Comment[]> {
  const params = new URLSearchParams();
  if (nodeId) params.set('node_id', nodeId);
  const url = `/projects/${encodeURIComponent(slug)}/comments${params.toString() ? '?' + params.toString() : ''}`;
  const res = await api.get(url);
  return (res.data as { comments?: readonly Comment[] }).comments ?? [];
}

export async function createComment(slug: string, nodeId: string, body: string): Promise<Comment> {
  const res = await api.post(`/projects/${encodeURIComponent(slug)}/comments`, {
    node_id: nodeId,
    body,
  });
  return (res.data as { comment: Comment }).comment;
}

export async function deleteComment(slug: string, id: number): Promise<void> {
  await api.delete(`/projects/${encodeURIComponent(slug)}/comments/${id}`);
}
