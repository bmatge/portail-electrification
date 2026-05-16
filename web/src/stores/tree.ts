// `useTreeStore` — stockage en mémoire + persistence auth-aware de
// l'arborescence d'un projet.
//
// Pattern :
//   - hydrate(slug) :
//       1. si bac à sable actif pour ce slug → charge depuis IndexedDB,
//          fallback API si pas d'entrée locale.
//       2. sinon → charge depuis l'API.
//   - save() :
//       1. si user anonyme → écrit dans IndexedDB (debounce 500ms via
//          un Date.now() naïf, voire instantané).
//       2. sinon → PUT /tree avec If-Match.
// Le composant n'a jamais à choisir : il appelle save() avec l'arbre courant.

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as treeApi from '../api/tree.api.js';
import type { RevisionSummary } from '../api/tree.api.js';
import { useAuthStore } from './auth.js';
import {
  useSandboxStore,
  loadSandboxEntry,
  saveSandboxEntry,
  clearSandboxArea,
} from './sandbox.js';

export interface TreeNode {
  id: string;
  label: string;
  type?: string;
  tldr?: string;
  page_type?: string;
  types?: string[];
  audiences?: string[];
  deadline?: string;
  dispositifs?: string[];
  mesures?: string[];
  blocks?: unknown[];
  maquette?: Record<string, unknown>;
  children?: TreeNode[];
  [k: string]: unknown;
}

export const useTreeStore = defineStore('tree', () => {
  const slug = ref<string | null>(null);
  const tree = ref<TreeNode | null>(null);
  const revision = ref<RevisionSummary | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const dirty = ref(false);
  const error = ref<string | null>(null);
  const localSavedAt = ref<string | null>(null);

  const persistTarget = computed<'api' | 'local'>(() => {
    const auth = useAuthStore();
    const sandbox = useSandboxStore();
    if (auth.user) return 'api';
    return sandbox.isActive(slug.value ?? '') ? 'local' : 'api';
  });

  async function hydrate(newSlug: string): Promise<void> {
    slug.value = newSlug;
    loading.value = true;
    error.value = null;
    try {
      const sandbox = useSandboxStore();
      await sandbox.hydrate();
      if (sandbox.isActive(newSlug)) {
        const local = await loadSandboxEntry<{
          tree: TreeNode;
          revision: RevisionSummary;
        }>(newSlug, 'tree');
        if (local) {
          tree.value = local.value.tree;
          revision.value = local.value.revision;
          localSavedAt.value = local.savedAt;
          dirty.value = false;
          return;
        }
      }
      const head = await treeApi.getTree(newSlug);
      tree.value = head.tree as TreeNode;
      revision.value = head.revision;
      localSavedAt.value = null;
      dirty.value = false;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function setTree(next: TreeNode): void {
    tree.value = next;
    dirty.value = true;
  }

  async function save(message = ''): Promise<{ conflict?: true } | undefined> {
    if (!slug.value || !tree.value || !revision.value) return undefined;
    saving.value = true;
    error.value = null;
    try {
      if (persistTarget.value === 'local') {
        await saveSandboxEntry(slug.value, 'tree', { tree: tree.value, revision: revision.value });
        localSavedAt.value = new Date().toISOString();
        dirty.value = false;
        return undefined;
      }
      try {
        const res = await treeApi.saveTree(slug.value, tree.value, revision.value.id, message);
        revision.value = res.revision;
        dirty.value = false;
        return undefined;
      } catch (e) {
        const err = e as { response?: { status?: number } };
        if (err.response?.status === 409) {
          return { conflict: true };
        }
        throw e;
      }
    } catch (e) {
      error.value = (e as Error).message;
      return undefined;
    } finally {
      saving.value = false;
    }
  }

  async function discardLocal(): Promise<void> {
    if (!slug.value) return;
    await clearSandboxArea(slug.value, 'tree');
    localSavedAt.value = null;
    await hydrate(slug.value);
  }

  return {
    slug,
    tree,
    revision,
    loading,
    saving,
    dirty,
    error,
    localSavedAt,
    persistTarget,
    hydrate,
    setTree,
    save,
    discardLocal,
  };
});
