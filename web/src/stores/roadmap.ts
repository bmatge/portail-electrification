// `useRoadmapStore` — même pattern que `useTreeStore` mais pour la roadmap.
//
// Roadmap shape : `{ meta?: object, items: RoadmapItem[] }` (cf.
// docs/bundle-format.md). Pas de validation forte côté store ; les
// composants posent leur propre garde-fou.

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

export interface RoadmapItem {
  id: string;
  node_id?: string;
  label?: string;
  audience?: string;
  audiences?: string[];
  deadline?: string;
  page_type?: string;
  type?: string;
  description?: string;
  [k: string]: unknown;
}

export interface RoadmapData {
  meta?: Record<string, unknown>;
  items: RoadmapItem[];
}

export const useRoadmapStore = defineStore('roadmap', () => {
  const slug = ref<string | null>(null);
  const roadmap = ref<RoadmapData | null>(null);
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
          roadmap: RoadmapData;
          revision: RevisionSummary;
        }>(newSlug, 'roadmap');
        if (local) {
          roadmap.value = local.value.roadmap;
          revision.value = local.value.revision;
          localSavedAt.value = local.savedAt;
          dirty.value = false;
          return;
        }
      }
      const head = await treeApi.getRoadmap(newSlug);
      roadmap.value = head.roadmap as RoadmapData;
      revision.value = head.revision;
      localSavedAt.value = null;
      dirty.value = false;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function setRoadmap(next: RoadmapData): void {
    roadmap.value = next;
    dirty.value = true;
  }

  async function save(message = ''): Promise<{ conflict?: true } | undefined> {
    if (!slug.value || !roadmap.value || !revision.value) return undefined;
    saving.value = true;
    error.value = null;
    try {
      if (persistTarget.value === 'local') {
        await saveSandboxEntry(slug.value, 'roadmap', {
          roadmap: roadmap.value,
          revision: revision.value,
        });
        localSavedAt.value = new Date().toISOString();
        dirty.value = false;
        return undefined;
      }
      try {
        const res = await treeApi.saveRoadmap(
          slug.value,
          roadmap.value,
          revision.value.id,
          message,
        );
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
    await clearSandboxArea(slug.value, 'roadmap');
    localSavedAt.value = null;
    await hydrate(slug.value);
  }

  return {
    slug,
    roadmap,
    revision,
    loading,
    saving,
    dirty,
    error,
    localSavedAt,
    persistTarget,
    hydrate,
    setRoadmap,
    save,
    discardLocal,
  };
});
