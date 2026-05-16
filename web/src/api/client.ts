// Client axios configuré pour parler à /api avec credentials cookie.
// Un intercepteur 401 force la redirection vers /login en cas d'expiration
// de session côté serveur (Phase 8 ajoutera la persistance du draft).

import axios, { type AxiosInstance } from 'axios';

export function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '/api',
    withCredentials: true,
    headers: { Accept: 'application/json' },
  });
  return client;
}

export const api = createApiClient();
