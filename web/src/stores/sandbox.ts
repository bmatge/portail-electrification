// `useSandboxStore` — état global du bac à sable anonyme.
//
// Un user non authentifié peut "forker localement" un projet : toutes ses
// modifications restent en IndexedDB et ne touchent jamais le serveur.
// Le mode est activé explicitement (modal proposé à la première tentative
// d'édition), persistant entre rechargements de page (clé `sandbox.active`).
//
// L'export bundle reconstruit un payload conforme à docs/bundle-format.md
// pour pouvoir transmettre le brouillon à un admin.

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const ACTIVE_KEY = 'sandbox.active';

export interface SandboxModalState {
  readonly visible: boolean;
  readonly intent: 'edit' | 'unknown';
}

export const useSandboxStore = defineStore('sandbox', () => {
  // `activeSlugs` : ensemble des projets actuellement en mode bac à sable.
  const activeSlugs = ref<ReadonlySet<string>>(new Set());
  const hydrated = ref(false);
  const modal = ref<SandboxModalState>({ visible: false, intent: 'unknown' });

  async function hydrate(): Promise<void> {
    if (hydrated.value) return;
    const stored = (await idbGet(ACTIVE_KEY)) as readonly string[] | undefined;
    activeSlugs.value = new Set(stored ?? []);
    hydrated.value = true;
  }

  async function persist(): Promise<void> {
    await idbSet(ACTIVE_KEY, Array.from(activeSlugs.value));
  }

  function isActive(slug: string): boolean {
    return activeSlugs.value.has(slug);
  }

  async function activate(slug: string): Promise<void> {
    if (activeSlugs.value.has(slug)) return;
    const next = new Set(activeSlugs.value);
    next.add(slug);
    activeSlugs.value = next;
    await persist();
  }

  async function deactivate(slug: string): Promise<void> {
    if (!activeSlugs.value.has(slug)) return;
    const next = new Set(activeSlugs.value);
    next.delete(slug);
    activeSlugs.value = next;
    await persist();
  }

  function openModal(intent: 'edit' = 'edit'): void {
    modal.value = { visible: true, intent };
  }

  function closeModal(): void {
    modal.value = { visible: false, intent: 'unknown' };
  }

  const anyActive = computed(() => activeSlugs.value.size > 0);

  return {
    activeSlugs,
    hydrated,
    modal,
    hydrate,
    isActive,
    activate,
    deactivate,
    openModal,
    closeModal,
    anyActive,
  };
});

// Helper IndexedDB pour les stores de contenu projet (tree, roadmap, data…).
//
// Chaque entrée locale stocke `{ value, savedAt }` pour pouvoir afficher
// dans le bandeau « modifié il y a 12 min ».
export interface SandboxEntry<T> {
  readonly value: T;
  readonly savedAt: string;
}

export function sandboxKey(slug: string, area: string): string {
  return `sandbox.${slug}.${area}`;
}

export async function loadSandboxEntry<T>(
  slug: string,
  area: string,
): Promise<SandboxEntry<T> | null> {
  const v = (await idbGet(sandboxKey(slug, area))) as SandboxEntry<T> | undefined;
  return v ?? null;
}

export async function saveSandboxEntry<T>(slug: string, area: string, value: T): Promise<void> {
  const entry: SandboxEntry<T> = { value, savedAt: new Date().toISOString() };
  await idbSet(sandboxKey(slug, area), entry);
}

export async function clearSandboxArea(slug: string, area: string): Promise<void> {
  await idbDel(sandboxKey(slug, area));
}

export async function clearAllSandboxAreas(slug: string): Promise<void> {
  const areas = [
    'tree',
    'roadmap',
    'data.vocab',
    'data.dispositifs',
    'data.mesures',
    'data.objectifs',
    'data.drupal_structure',
  ];
  await Promise.all(areas.map((a) => clearSandboxArea(slug, a)));
}
