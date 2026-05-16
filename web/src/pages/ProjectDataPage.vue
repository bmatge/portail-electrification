<script setup lang="ts">
// Page Modèle de données : 3 vocab éditables (publics / échéances / types
// de page) + catalogues lecture rapide (dispositifs, mesures, structure
// CMS). Sections en accordéons fermés par défaut, état persistant entre
// re-renders.

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  LEGACY_VOCAB,
  slugify,
  uniqueKey,
  type VocabConfig,
  type VocabEntry,
} from '@latelier/shared';
import {
  useVocabStore,
  useDispositifsStore,
  useMesuresStore,
  useDrupalStructureStore,
} from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import DispositifsCatalogPage from './catalogs/DispositifsCatalogPage.vue';
import MesuresCatalogPage from './catalogs/MesuresCatalogPage.vue';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const vocabStore = useVocabStore();
const dispositifsStore = useDispositifsStore();
const mesuresStore = useMesuresStore();
const drupalStore = useDrupalStructureStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();

onMounted(async () => {
  if (slug.value) {
    await Promise.all([
      vocabStore.hydrate(slug.value),
      dispositifsStore.hydrate(slug.value),
      mesuresStore.hydrate(slug.value),
      drupalStore.hydrate(slug.value),
    ]);
  }
});

watch(slug, async (s) => {
  if (s) {
    await Promise.all([
      vocabStore.hydrate(s),
      dispositifsStore.hydrate(s),
      mesuresStore.hydrate(s),
      drupalStore.hydrate(s),
    ]);
  }
});

const canEdit = computed(() => {
  if (auth.can('data:write')) return true;
  return sandbox.isActive(slug.value);
});

const vocab = computed<VocabConfig>(() => {
  const data = vocabStore.data as VocabConfig | null;
  if (data && Array.isArray(data.audiences)) return data;
  return LEGACY_VOCAB;
});

function ensureEditOrModal(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer ce catalogue.");
  return false;
}

async function saveVocab(next: VocabConfig): Promise<void> {
  vocabStore.setData(next);
  await vocabStore.save();
}

type VocabKind = 'audiences' | 'deadlines' | 'page_types';

function addEntry(kind: VocabKind, label: string): void {
  if (!ensureEditOrModal()) return;
  const trimmed = label.trim();
  if (!trimmed) return;
  const current = vocab.value;
  const existing = new Set(current[kind].map((e) => e.key));
  const key = uniqueKey(trimmed, existing);
  const nextEntry: VocabEntry = { key, label: trimmed };
  const nextConfig: VocabConfig = {
    ...current,
    [kind]: [...current[kind], nextEntry],
  };
  void saveVocab(nextConfig);
}

function renameEntry(kind: VocabKind, index: number, newLabel: string): void {
  if (!ensureEditOrModal()) return;
  const current = vocab.value;
  const list = [...current[kind]];
  const existing = list[index];
  if (!existing) return;
  list[index] = { key: existing.key, label: newLabel };
  void saveVocab({ ...current, [kind]: list });
}

function removeEntry(kind: VocabKind, index: number): void {
  if (!ensureEditOrModal()) return;
  const current = vocab.value;
  const list = current[kind].filter((_, i) => i !== index);
  void saveVocab({ ...current, [kind]: list });
}

function moveEntry(kind: VocabKind, index: number, delta: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const current = vocab.value;
  const list = [...current[kind]];
  const j = index + delta;
  if (j < 0 || j >= list.length) return;
  const a = list[index];
  const b = list[j];
  if (!a || !b) return;
  list[index] = b;
  list[j] = a;
  void saveVocab({ ...current, [kind]: list });
}

const newLabels = ref<{ audiences: string; deadlines: string; page_types: string }>({
  audiences: '',
  deadlines: '',
  page_types: '',
});

const openSections = ref<Set<string>>(new Set(['audiences']));

function isOpen(id: string): boolean {
  return openSections.value.has(id);
}
function onToggle(id: string, e: Event): void {
  const next = new Set(openSections.value);
  if ((e.target as HTMLDetailsElement).open) next.add(id);
  else next.delete(id);
  openSections.value = next;
}

const dispositifsCount = computed(() => {
  const data = dispositifsStore.data;
  if (data && typeof data === 'object' && 'dispositifs' in data) {
    const arr = (data as { dispositifs: unknown[] }).dispositifs;
    return Array.isArray(arr) ? arr.length : 0;
  }
  return 0;
});
const mesuresCount = computed(() => {
  const data = mesuresStore.data;
  if (data && typeof data === 'object' && 'mesures' in data) {
    const arr = (data as { mesures: unknown[] }).mesures;
    return Array.isArray(arr) ? arr.length : 0;
  }
  return 0;
});

function vocabPreview(label: string): string {
  return slugify(label) || 'item';
}
</script>

<template>
  <div v-if="vocabStore.loading">Chargement…</div>
  <div v-else>
    <p style="color: #555">
      Définissez les vocabulaires propres à ce projet (publics, échéances, types de page) ainsi que
      les catalogues. Les keys sont auto-générées du label et figées à la création : vous pouvez
      renommer le label sans casser de référence.
    </p>

    <details class="panel" :open="isOpen('audiences')" @toggle="(e) => onToggle('audiences', e)">
      <summary>Publics cibles ({{ vocab.audiences.length }})</summary>
      <div class="panel-body">
        <ul style="list-style: none; padding: 0; margin: 0">
          <li v-for="(a, i) in vocab.audiences" :key="a.key" class="vocab-row">
            <input
              type="text"
              :value="a.label"
              class="input"
              style="flex: 1"
              @change="(e) => renameEntry('audiences', i, (e.target as HTMLInputElement).value)"
            />
            <code class="vocab-key">{{ a.key }}</code>
            <button type="button" class="btn-outline btn" @click="moveEntry('audiences', i, -1)">
              ↑
            </button>
            <button type="button" class="btn-outline btn" @click="moveEntry('audiences', i, 1)">
              ↓
            </button>
            <button type="button" class="btn vocab-del" @click="removeEntry('audiences', i)">
              ×
            </button>
          </li>
        </ul>
        <div class="vocab-add">
          <input
            v-model="newLabels.audiences"
            placeholder="Nouveau public…"
            class="input"
            style="flex: 1"
            @keydown.enter="
              () => {
                addEntry('audiences', newLabels.audiences);
                newLabels.audiences = '';
              }
            "
          />
          <code class="vocab-key">{{ vocabPreview(newLabels.audiences) }}</code>
          <button
            type="button"
            class="btn"
            @click="
              () => {
                addEntry('audiences', newLabels.audiences);
                newLabels.audiences = '';
              }
            "
          >
            + Ajouter
          </button>
        </div>
      </div>
    </details>

    <details class="panel" :open="isOpen('deadlines')" @toggle="(e) => onToggle('deadlines', e)">
      <summary>Échéances ({{ vocab.deadlines.length }})</summary>
      <div class="panel-body">
        <ul style="list-style: none; padding: 0; margin: 0">
          <li v-for="(d, i) in vocab.deadlines" :key="d.key" class="vocab-row">
            <input
              type="text"
              :value="d.label"
              class="input"
              style="flex: 1"
              @change="(e) => renameEntry('deadlines', i, (e.target as HTMLInputElement).value)"
            />
            <code class="vocab-key">{{ d.key }}</code>
            <button type="button" class="btn-outline btn" @click="moveEntry('deadlines', i, -1)">
              ↑
            </button>
            <button type="button" class="btn-outline btn" @click="moveEntry('deadlines', i, 1)">
              ↓
            </button>
            <button type="button" class="btn vocab-del" @click="removeEntry('deadlines', i)">
              ×
            </button>
          </li>
        </ul>
        <div class="vocab-add">
          <input
            v-model="newLabels.deadlines"
            placeholder="Nouvelle échéance…"
            class="input"
            style="flex: 1"
            @keydown.enter="
              () => {
                addEntry('deadlines', newLabels.deadlines);
                newLabels.deadlines = '';
              }
            "
          />
          <code class="vocab-key">{{ vocabPreview(newLabels.deadlines) }}</code>
          <button
            type="button"
            class="btn"
            @click="
              () => {
                addEntry('deadlines', newLabels.deadlines);
                newLabels.deadlines = '';
              }
            "
          >
            + Ajouter
          </button>
        </div>
      </div>
    </details>

    <details class="panel" :open="isOpen('page_types')" @toggle="(e) => onToggle('page_types', e)">
      <summary>Types de page ({{ vocab.page_types.length }})</summary>
      <div class="panel-body">
        <ul style="list-style: none; padding: 0; margin: 0">
          <li v-for="(t, i) in vocab.page_types" :key="t.key" class="vocab-row">
            <input
              type="text"
              :value="t.label"
              class="input"
              style="flex: 1"
              @change="(e) => renameEntry('page_types', i, (e.target as HTMLInputElement).value)"
            />
            <code class="vocab-key">{{ t.key }}</code>
            <button type="button" class="btn-outline btn" @click="moveEntry('page_types', i, -1)">
              ↑
            </button>
            <button type="button" class="btn-outline btn" @click="moveEntry('page_types', i, 1)">
              ↓
            </button>
            <button type="button" class="btn vocab-del" @click="removeEntry('page_types', i)">
              ×
            </button>
          </li>
        </ul>
        <div class="vocab-add">
          <input
            v-model="newLabels.page_types"
            placeholder="Nouveau type de page…"
            class="input"
            style="flex: 1"
            @keydown.enter="
              () => {
                addEntry('page_types', newLabels.page_types);
                newLabels.page_types = '';
              }
            "
          />
          <code class="vocab-key">{{ vocabPreview(newLabels.page_types) }}</code>
          <button
            type="button"
            class="btn"
            @click="
              () => {
                addEntry('page_types', newLabels.page_types);
                newLabels.page_types = '';
              }
            "
          >
            + Ajouter
          </button>
        </div>
      </div>
    </details>

    <details
      class="panel"
      :open="isOpen('dispositifs')"
      @toggle="(e) => onToggle('dispositifs', e)"
    >
      <summary>
        Catalogue Dispositifs
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !dispositifsCount }"
          >{{ dispositifsCount }}</span
        >
      </summary>
      <div class="panel-body">
        <DispositifsCatalogPage :slug="slug" />
      </div>
    </details>

    <details class="panel" :open="isOpen('mesures')" @toggle="(e) => onToggle('mesures', e)">
      <summary>
        Catalogue Mesures
        <span class="panel-count count-badge" :class="{ 'count-badge--muted': !mesuresCount }">{{
          mesuresCount
        }}</span>
      </summary>
      <div class="panel-body">
        <MesuresCatalogPage :slug="slug" />
      </div>
    </details>

    <details
      class="panel"
      :open="isOpen('drupal_structure')"
      @toggle="(e) => onToggle('drupal_structure', e)"
    >
      <summary>Structure CMS (drupal_structure)</summary>
      <div class="panel-body">
        <p style="color: #555; font-size: 0.9rem">
          Structure CMS du site cible. Affichage JSON — l'édition complète (taxonomies, blocs,
          composants) reste à porter en v1.1.
        </p>
        <pre class="json-preview">{{ JSON.stringify(drupalStore.data, null, 2) }}</pre>
      </div>
    </details>

    <p
      v-if="vocabStore.persistTarget === 'local' && vocabStore.localSavedAt"
      class="alert alert-info"
    >
      Modifications locales sauvegardées (bac à sable).
    </p>
  </div>
</template>

<style scoped>
.vocab-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.25rem 0;
  border-bottom: 1px solid #eee;
}
.vocab-key {
  font-size: 0.8rem;
  color: #888;
  min-width: 8rem;
}
.vocab-del {
  background: #b03a3a;
}
.vocab-add {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.75rem;
}
.json-preview {
  background: #f4f4f4;
  padding: 0.75rem;
  overflow: auto;
  font-size: 0.8rem;
  max-height: 320px;
}
</style>
