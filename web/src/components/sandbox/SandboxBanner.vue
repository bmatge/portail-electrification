<script setup lang="ts">
// Bandeau persistant affiché quand un projet est en mode bac à sable.
// Permet de revenir à la version officielle (purge IndexedDB) et d'exporter
// le brouillon en JSON conforme à docs/bundle-format.md.

import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { useSandboxStore, clearAllSandboxAreas } from '../../stores/sandbox.js';
import { useTreeStore } from '../../stores/tree.js';
import { useRoadmapStore } from '../../stores/roadmap.js';
import {
  useVocabStore,
  useDispositifsStore,
  useMesuresStore,
  useObjectifsStore,
  useDrupalStructureStore,
} from '../../stores/data.js';
import { useProjectStore } from '../../stores/project.js';

const sandbox = useSandboxStore();
const route = useRoute();
const tree = useTreeStore();
const roadmap = useRoadmapStore();
const vocab = useVocabStore();
const dispositifs = useDispositifsStore();
const mesures = useMesuresStore();
const objectifs = useObjectifsStore();
const drupal = useDrupalStructureStore();
const projectStore = useProjectStore();

const exporting = ref(false);
const confirming = ref(false);

function currentSlug(): string | null {
  const slug = route.params['slug'];
  return typeof slug === 'string' ? slug : null;
}

async function exportBundle(): Promise<void> {
  const slug = currentSlug();
  const project = projectStore.project;
  if (!slug || !project) return;
  exporting.value = true;
  try {
    const bundle = {
      version: 1 as const,
      exported_at: new Date().toISOString(),
      project: {
        slug: project.slug,
        name: project.name,
        description: project.description ?? '',
      },
      tree: tree.tree ?? null,
      roadmap: roadmap.roadmap ?? { meta: {}, items: [] },
      data: {
        vocab: vocab.data,
        dispositifs: dispositifs.data,
        mesures: mesures.data,
        objectifs: objectifs.data,
        drupal_structure: drupal.data,
      },
      _sandbox_note:
        'Brouillon exporté depuis le bac à sable anonyme. Re-importable via POST /api/projects/import par un admin.',
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brouillon-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

async function discardLocal(): Promise<void> {
  const slug = currentSlug();
  if (!slug) return;
  await clearAllSandboxAreas(slug);
  await sandbox.deactivate(slug);
  // Recharge en mode API
  await tree.hydrate(slug);
  await roadmap.hydrate(slug);
  confirming.value = false;
}

function startConfirm(): void {
  confirming.value = true;
}
function cancelConfirm(): void {
  confirming.value = false;
}
</script>

<template>
  <div v-if="currentSlug() && sandbox.isActive(currentSlug() ?? '')" class="sandbox-banner">
    <span
      >🧪 <strong>Mode bac à sable</strong> — vos modifications restent dans votre navigateur</span
    >
    <span class="spacer"></span>
    <button class="btn-outline btn" type="button" :disabled="exporting" @click="exportBundle">
      {{ exporting ? 'Export…' : 'Exporter mon brouillon' }}
    </button>
    <template v-if="!confirming">
      <button type="button" class="btn-outline btn" @click="startConfirm">
        Revenir à la version officielle
      </button>
    </template>
    <template v-else>
      <span style="color: #553f00">Confirmer la perte des modifications locales ?</span>
      <button class="btn" type="button" style="background: #b03a3a" @click="discardLocal">
        Tout effacer
      </button>
      <button class="btn-outline btn" type="button" @click="cancelConfirm">Annuler</button>
    </template>
  </div>
</template>
