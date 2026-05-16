import type { Role } from '@latelier/shared';
import { api } from './client.js';

export interface MeUser {
  readonly id: number;
  readonly display_name: string;
  readonly email: string | null;
  readonly status: 'active' | 'disabled' | 'pending';
  readonly roles: readonly { readonly role: Role; readonly projectId: number | null }[];
}

export async function requestMagicLink(email: string): Promise<void> {
  await api.post('/auth/magic-link', { email });
}

export async function consumeCallback(
  token: string,
): Promise<{ user_id: number; expires_at: string; created: boolean }> {
  const res = await api.get('/auth/callback', { params: { token } });
  return res.data as { user_id: number; expires_at: string; created: boolean };
}

export async function fetchMe(): Promise<MeUser | null> {
  try {
    const res = await api.get('/me');
    return (res.data as { user: MeUser }).user;
  } catch (err) {
    if (axiosIs401(err)) return null;
    throw err;
  }
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

function axiosIs401(err: unknown): boolean {
  const e = err as { isAxiosError?: boolean; response?: { status?: number } };
  return Boolean(e.isAxiosError) && e.response?.status === 401;
}
