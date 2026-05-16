<script setup lang="ts">
// Composant inclus dans ProjectDataPage (section "Catalogue Dispositifs").
// Édite la clé `dispositifs.dispositifs[]` avec UI complète (au lieu du
// `<pre>JSON</pre>` initial).

import { computed, ref } from 'vue';
import { useDispositifsStore } from '../../stores/data.js';
import { useAuthStore } from '../../stores/auth.js';
import { useSandboxStore } from '../../stores/sandbox.js';
import InlineEdit from '../../components/ui/InlineEdit.vue';

const props = defineProps<{
  slug: string;
}>();

const store = useDispositifsStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();

interface Dispositif {
  id: string;
  category?: string;
  audience?: string;
  name: string;
  url?: string;
  tel?: string;
  description?: string;
  porteur?: string;
  tutelle?: string;
  [k: string]: unknown;
}
interface DispositifsData {
  meta?: Record<string, unknown>;
  dispositifs: Dispositif[];
}

const canEdit = computed(() => {
  if (auth.can('data:write')) return true;
  return sandbox.isActive(props.slug);
});

const data = computed<DispositifsData>(() => {
  const raw = store.data as DispositifsData | null;
  if (raw && Array.isArray(raw.dispositifs)) return raw;
  return { dispositifs: [] };
});

const search = ref('');
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return data.value.dispositifs;
  return data.value.dispositifs.filter(
    (d) =>
      d.name.toLowerCase().includes(term) ||
      (d.description ?? '').toLowerCase().includes(term) ||
      (d.category ?? '').toLowerCase().includes(term),
  );
});

const categories = computed(() => {
  const set = new Set<string>();
  for (const d of data.value.dispositifs) if (d.category) set.add(d.category);
  return Array.from(set).sort();
});

function ensureEdit(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

async function commit(next: DispositifsData): Promise<void> {
  store.setData(next);
  await store.save();
}

function clone(): DispositifsData {
  return JSON.parse(JSON.stringify(data.value)) as DispositifsData;
}

function newDispositifId(): string {
  return 'D-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function addDispositif(): void {
  if (!ensureEdit()) return;
  const next = clone();
  next.dispositifs.unshift({
    id: newDispositifId(),
    name: 'Nouveau dispositif',
    category: '',
    description: '',
    url: '',
    porteur: '',
  });
  void commit(next);
}

function updateField(i: number, field: keyof Dispositif, value: string): void {
  if (!ensureEdit()) return;
  const next = clone();
  const d = next.dispositifs[i];
  if (!d) return;
  (d as Record<string, unknown>)[field] = value;
  void commit(next);
}

function removeDispositif(i: number): void {
  if (!ensureEdit()) return;
  const d = data.value.dispositifs[i];
  if (!d) return;
  if (!confirm(`Supprimer le dispositif « ${d.name} » ?`)) return;
  const next = clone();
  next.dispositifs.splice(i, 1);
  void commit(next);
}

function move(i: number, dir: -1 | 1): void {
  if (!ensureEdit()) return;
  const next = clone();
  const j = i + dir;
  if (j < 0 || j >= next.dispositifs.length) return;
  const a = next.dispositifs[i];
  const b = next.dispositifs[j];
  if (!a || !b) return;
  next.dispositifs[i] = b;
  next.dispositifs[j] = a;
  void commit(next);
}
</script>

<template>
  <div>
    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        placeholder="🔍 Filtrer les dispositifs…"
        class="fr-input"
        style="flex: 1"
      />
      <span style="font-size: 0.85rem; color: #555"
        >{{ filtered.length }} / {{ data.dispositifs.length }} dispositif{{
          data.dispositifs.length > 1 ? 's' : ''
        }}</span
      >
      <button class="fr-btn fr-btn--sm" @click="addDispositif">+ Ajouter</button>
    </div>

    <p v-if="categories.length" style="font-size: 0.85rem; color: #666">
      <strong>Catégories utilisées :</strong>
      <span v-for="c in categories" :key="c" class="badge" style="margin-right: 0.25rem">{{
        c
      }}</span>
    </p>

    <p v-if="data.dispositifs.length === 0" style="color: #888; padding: 1rem">
      Aucun dispositif. Ajoutez-en pour les rattacher ensuite aux nœuds de l'arborescence.
    </p>

    <div v-for="d in filtered" :key="d.id" class="dispositif-card l-card">
      <div class="dispositif-card__head">
        <code class="dispositif-card__id">{{ d.id }}</code>
        <InlineEdit
          :value="d.name"
          :can-edit="canEdit"
          placeholder="Nom du dispositif…"
          display-class="dispositif-card__name"
          @update="(v) => updateField(data.dispositifs.indexOf(d), 'name', v)"
          @edit-attempt="ensureEdit"
        />
        <span class="spacer"></span>
        <button
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          @click="move(data.dispositifs.indexOf(d), -1)"
        >
          ↑
        </button>
        <button
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          @click="move(data.dispositifs.indexOf(d), 1)"
        >
          ↓
        </button>
        <button
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          style="color: #ce0500"
          @click="removeDispositif(data.dispositifs.indexOf(d))"
        >
          🗑
        </button>
      </div>
      <div class="dispositif-card__grid">
        <label class="field">
          <span>Catégorie</span>
          <InlineEdit
            :value="d.category ?? ''"
            :can-edit="canEdit"
            placeholder="—"
            @update="(v) => updateField(data.dispositifs.indexOf(d), 'category', v)"
            @edit-attempt="ensureEdit"
          />
        </label>
        <label class="field">
          <span>Public</span>
          <InlineEdit
            :value="d.audience ?? ''"
            :can-edit="canEdit"
            placeholder="—"
            @update="(v) => updateField(data.dispositifs.indexOf(d), 'audience', v)"
            @edit-attempt="ensureEdit"
          />
        </label>
        <label class="field">
          <span>Porteur</span>
          <InlineEdit
            :value="d.porteur ?? ''"
            :can-edit="canEdit"
            placeholder="—"
            @update="(v) => updateField(data.dispositifs.indexOf(d), 'porteur', v)"
            @edit-attempt="ensureEdit"
          />
        </label>
        <label class="field">
          <span>URL</span>
          <InlineEdit
            :value="d.url ?? ''"
            :can-edit="canEdit"
            placeholder="https://…"
            @update="(v) => updateField(data.dispositifs.indexOf(d), 'url', v)"
            @edit-attempt="ensureEdit"
          />
        </label>
      </div>
      <label class="field" style="margin-top: 0.5rem">
        <span>Description</span>
        <InlineEdit
          :value="d.description ?? ''"
          textarea
          :rows="3"
          :can-edit="canEdit"
          placeholder="Cliquer pour décrire ce dispositif…"
          @update="(v) => updateField(data.dispositifs.indexOf(d), 'description', v)"
          @edit-attempt="ensureEdit"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.dispositif-card {
  margin-bottom: 0.5rem;
  padding: 0.75rem 1rem;
}
.dispositif-card__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.dispositif-card__id {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  background: #f1f1f1;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  color: #444;
}
.dispositif-card :deep(.dispositif-card__name) {
  font-weight: 600;
  font-size: 1rem;
}
.dispositif-card__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.5rem;
}
.spacer {
  flex: 1;
}
</style>
