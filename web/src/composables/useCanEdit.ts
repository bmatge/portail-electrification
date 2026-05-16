// `useCanEdit(permission, slug)` — composable factorisé pour les pages
// projet. Combine :
//   - check auth.can(permission, projectId) — éditeur scopé sur ce projet
//     est traité comme authoritative (le viewer global ne dégrade pas
//     son droit)
//   - bac à sable anonyme : un user non connecté peut éditer ses propres
//     brouillons locaux (IndexedDB)
//
// Évite la répétition du pattern d'import projectStore + le bug
// historique où `auth.can('tree:write')` était appelé sans projectId.

import { computed, type ComputedRef } from 'vue';
import type { Permission } from '@latelier/shared';
import { useAuthStore } from '../stores/auth.js';
import { useProjectStore } from '../stores/project.js';
import { useSandboxStore } from '../stores/sandbox.js';

export function useCanEdit(permission: Permission, slug: () => string): ComputedRef<boolean> {
  const auth = useAuthStore();
  const projectStore = useProjectStore();
  const sandbox = useSandboxStore();
  return computed(() => {
    if (auth.can(permission, projectStore.project?.id ?? null)) return true;
    return sandbox.isActive(slug());
  });
}
