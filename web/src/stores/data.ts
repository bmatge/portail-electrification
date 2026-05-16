// `useProjectDataStore` — un store par catalogue projet (vocab, dispositifs,
// mesures, objectifs, drupal_structure). Pattern identique aux stores tree
// et roadmap (auth-aware, IndexedDB en mode sandbox).
//
// Les `data` n'ont pas de revision/If-Match : PUT inconditionnel côté API.

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as treeApi from '../api/tree.api.js';
import { useAuthStore } from './auth.js';
import {
  useSandboxStore,
  loadSandboxEntry,
  saveSandboxEntry,
  clearSandboxArea,
} from './sandbox.js';

export type DataKey = 'vocab' | 'dispositifs' | 'mesures' | 'objectifs' | 'drupal_structure';

interface DataEntry {
  data: unknown;
  updated_at: string | null;
}

export function makeDataStore(key: DataKey) {
  const id = `data-${key}`;
  return defineStore(id, () => {
    const slug = ref<string | null>(null);
    const data = ref<unknown>(null);
    const updatedAt = ref<string | null>(null);
    const loading = ref(false);
    const saving = ref(false);
    const dirty = ref(false);
    const error = ref<string | null>(null);
    const localSavedAt = ref<string | null>(null);

    const area = `data.${key}`;

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
          const local = await loadSandboxEntry<DataEntry>(newSlug, area);
          if (local) {
            data.value = local.value.data;
            updatedAt.value = local.value.updated_at;
            localSavedAt.value = local.savedAt;
            dirty.value = false;
            return;
          }
        }
        const fetched = await treeApi.getData(newSlug, key);
        data.value = fetched.data;
        updatedAt.value = fetched.updated_at;
        localSavedAt.value = null;
        dirty.value = false;
      } catch (e) {
        error.value = (e as Error).message;
      } finally {
        loading.value = false;
      }
    }

    function setData(next: unknown): void {
      data.value = next;
      dirty.value = true;
    }

    async function save(): Promise<void> {
      if (!slug.value || data.value === null) return;
      saving.value = true;
      error.value = null;
      try {
        if (persistTarget.value === 'local') {
          await saveSandboxEntry<DataEntry>(slug.value, area, {
            data: data.value,
            updated_at: updatedAt.value,
          });
          localSavedAt.value = new Date().toISOString();
          dirty.value = false;
          return;
        }
        await treeApi.saveData(slug.value, key, data.value);
        updatedAt.value = new Date().toISOString();
        dirty.value = false;
      } catch (e) {
        error.value = (e as Error).message;
      } finally {
        saving.value = false;
      }
    }

    async function discardLocal(): Promise<void> {
      if (!slug.value) return;
      await clearSandboxArea(slug.value, area);
      localSavedAt.value = null;
      await hydrate(slug.value);
    }

    return {
      slug,
      data,
      updatedAt,
      loading,
      saving,
      dirty,
      error,
      localSavedAt,
      persistTarget,
      hydrate,
      setData,
      save,
      discardLocal,
    };
  });
}

export const useVocabStore = makeDataStore('vocab');
export const useDispositifsStore = makeDataStore('dispositifs');
export const useMesuresStore = makeDataStore('mesures');
export const useObjectifsStore = makeDataStore('objectifs');
export const useDrupalStructureStore = makeDataStore('drupal_structure');
