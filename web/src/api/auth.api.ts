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
    // Tout statut autre que 200 ⇒ pas de user. On loggue les 5xx pour
    // qu'ils restent visibles en console, mais on ne bloque pas le boot
    // de la SPA (sinon le router guard plante et l'utilisateur ne voit
    // même pas le bouton "Se connecter").
    const e = err as { response?: { status?: number; data?: unknown } };
    if (e.response?.status && e.response.status >= 500) {
      console.error('[auth.fetchMe] server error', e.response.status, e.response.data);
    }
    return null;
  }
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}
