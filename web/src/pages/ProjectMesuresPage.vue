<script setup lang="ts">
// Page "Politiques publiques" (legacy `mesures.html`) — kanban par
// échéance × axe, avec CRUD inline (création / édition / suppression).
// Toolbar Search + filtre Axe + filtre Public. Compteur global
// "X / Y mesures · Z portées par un nœud".

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { LEGACY_VOCAB, type VocabConfig } from '@latelier/shared';
import { useMesuresStore, useVocabStore } from '../stores/data.js';
import { useTreeStore } from '../stores/tree.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { useCanEdit } from '../composables/useCanEdit.js';
import PageHeader from '../components/ui/PageHeader.vue';
import InlineEdit from '../components/ui/InlineEdit.vue';

interface MesureAxe {
  id: string;
  label: string;
}
interface MesureMeta {
  title?: string;
  source?: string;
  axes?: MesureAxe[];
  [k: string]: unknown;
}
interface Mesure {
  id: string;
  axe?: string;
  objectif?: string | null;
  title?: string;
  label?: string;
  summary?: string;
  description?: string;
  audiences?: string[];
  deadline?: string;
  status?: string;
  pilote?: string;
  [k: string]: unknown;
}
interface MesuresData {
  meta?: MesureMeta;
  mesures: Mesure[];
}

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const store = useMesuresStore();
const treeStore = useTreeStore();
const vocabStore = useVocabStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();

onMounted(() => {
  if (slug.value) {
    void store.hydrate(slug.value);
    void treeStore.hydrate(slug.value);
    void vocabStore.hydrate(slug.value);
  }
});
watch(slug, (s) => {
  if (s) {
    void store.hydrate(s);
    void treeStore.hydrate(s);
    void vocabStore.hydrate(s);
  }
});

const canEdit = useCanEdit('data:write', () => slug.value);

const data = computed<MesuresData>(() => {
  const raw = store.data as MesuresData | null;
  if (raw && Array.isArray(raw.mesures)) return raw;
  return { mesures: [] };
});

const search = ref('');
const filterAxe = ref('');
const filterPublic = ref('');
const expandedId = ref<string | null>(null);

const axes = computed<MesureAxe[]>(() => {
  const fromMeta = data.value.meta?.axes ?? [];
  if (fromMeta.length) return fromMeta;
  const set = new Map<string, MesureAxe>();
  for (const m of data.value.mesures) {
    if (m.axe && !set.has(m.axe)) set.set(m.axe, { id: m.axe, label: m.axe });
  }
  // Toujours fournir au moins une catégorie pour pouvoir créer
  if (set.size === 0) set.set('transverse', { id: 'transverse', label: 'Transverse' });
  return Array.from(set.values());
});

const audiences = computed(() => {
  const set = new Set<string>();
  for (const m of data.value.mesures) for (const a of m.audiences ?? []) set.add(a);
  return Array.from(set).sort();
});

// Échéances projet — lues depuis le vocab (Modèle de données →
// Vocabulaires → Échéances). Fallback sur LEGACY_VOCAB si pas hydraté.
const vocab = computed<VocabConfig>(() => {
  const data = vocabStore.data as VocabConfig | null;
  if (data && Array.isArray(data.audiences)) return data;
  return LEGACY_VOCAB;
});

const DEADLINES = computed<readonly { key: string; label: string }[]>(() => {
  const list = vocab.value.deadlines;
  if (list.length > 0) return list;
  // Vocab vide : on tombe sur les keys legacy pour ne pas afficher 0 colonne.
  return LEGACY_VOCAB.deadlines;
});

// Mapping mesure.deadline → key vocab connue. Tolère les variations
// (séries legacy avec "juin" / "septembre" / "decembre" / "y2027").
function deadlineKey(m: Mesure): string {
  const raw = (m.deadline ?? '').toLowerCase().trim();
  if (!raw) return DEADLINES.value[DEADLINES.value.length - 1]?.key ?? '';
  // Match exact d'abord (cas standard où mesure.deadline === vocab key).
  if (DEADLINES.value.some((d) => d.key === raw)) return raw;
  // Sinon, heuristiques sur les vocab legacy bien connus.
  const heur = ((): string | null => {
    if (raw.includes('juin')) return 'juin';
    if (raw.includes('sept')) return 'septembre';
    if (raw.includes('déc') || raw.includes('dec')) return 'decembre';
    if (raw.includes('2027') || raw === 'y2027' || raw.includes('long')) return 'y2027';
    return null;
  })();
  if (heur && DEADLINES.value.some((d) => d.key === heur)) return heur;
  // Pas de match : on tombe dans la dernière colonne (catchall).
  return DEADLINES.value[DEADLINES.value.length - 1]?.key ?? raw;
}

// Mapping deadline key → classe CSS pour la couleur d'en-tête de colonne.
// On garde les variants connus (compatibilité visuelle avec roadmap +
// chip-toggle). Les nouvelles keys (court-terme, etc.) tombent en couleur
// neutre — c'est OK, le DSFR n'a pas de sémantique court/moyen/long.
function deadlineColorClass(key: string): string {
  if (key.includes('juin')) return 'kanban__col-header--juin-2026';
  if (key.includes('sept')) return 'kanban__col-header--septembre-2026';
  if (key.includes('dec') || key.includes('déc')) return 'kanban__col-header--decembre-2026';
  if (key.includes('2027') || key === 'y2027' || key.includes('long'))
    return 'kanban__col-header--2027';
  return '';
}

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return data.value.mesures.filter((m) => {
    if (term) {
      const hay = [m.id, m.title, m.label, m.summary, m.description].join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (filterAxe.value && m.axe !== filterAxe.value) return false;
    if (filterPublic.value && !(m.audiences ?? []).includes(filterPublic.value)) return false;
    return true;
  });
});

const countByDeadline = computed(() => {
  const counts: Record<string, number> = {};
  for (const d of DEADLINES.value) counts[d.key] = 0;
  for (const m of filtered.value) {
    const k = deadlineKey(m);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
});

const cellMesures = computed(() => {
  const map = new Map<string, Mesure[]>();
  for (const axe of axes.value) for (const d of DEADLINES.value) map.set(`${axe.id}:${d.key}`, []);
  for (const m of filtered.value) {
    const axeId = m.axe ?? axes.value[0]?.id ?? 'transverse';
    const dKey = deadlineKey(m);
    const cellKey = `${axeId}:${dKey}`;
    const list = map.get(cellKey);
    if (list) list.push(m);
    else map.set(cellKey, [m]);
  }
  return map;
});

const carriedIds = computed(() => {
  const set = new Set<string>();
  const root = treeStore.tree;
  if (!root) return set;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { mesures?: string[]; children?: unknown[] };
    for (const id of n.mesures ?? []) set.add(id);
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return set;
});

const carriedCount = computed(
  () => filtered.value.filter((m) => carriedIds.value.has(m.id)).length,
);

function mesureLabel(m: Mesure): string {
  return m.title ?? m.label ?? '(sans titre)';
}

function ensureEdit(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

async function commit(next: MesuresData): Promise<void> {
  store.setData(next);
  await store.save();
}

function clone(): MesuresData {
  return JSON.parse(JSON.stringify(data.value)) as MesuresData;
}

function nextMesureId(): string {
  const existing = new Set(data.value.mesures.map((m) => m.id));
  for (let i = 1; i < 1000; i++) {
    const candidate = `M${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return 'M-' + Math.random().toString(36).slice(2, 6);
}

function addMesureIn(axeId: string, dKey: string): void {
  if (!ensureEdit()) return;
  const next = clone();
  const id = nextMesureId();
  next.mesures.push({
    id,
    axe: axeId,
    deadline: dKey,
    title: 'Nouvelle mesure',
    summary: '',
    audiences: [],
  });
  expandedId.value = id;
  void commit(next);
}

function updateField<K extends keyof Mesure>(id: string, field: K, value: Mesure[K]): void {
  if (!ensureEdit()) return;
  const next = clone();
  const m = next.mesures.find((x) => x.id === id);
  if (!m) return;
  m[field] = value;
  void commit(next);
}

function toggleAudience(id: string, audience: string): void {
  if (!ensureEdit()) return;
  const next = clone();
  const m = next.mesures.find((x) => x.id === id);
  if (!m) return;
  const list = m.audiences ?? [];
  m.audiences = list.includes(audience) ? list.filter((a) => a !== audience) : [...list, audience];
  void commit(next);
}

function removeMesure(id: string): void {
  if (!ensureEdit()) return;
  const m = data.value.mesures.find((x) => x.id === id);
  if (!m) return;
  const next = clone();
  next.mesures = next.mesures.filter((x) => x.id !== id);
  if (expandedId.value === id) expandedId.value = null;
  void commit(next);
}

function changeAxe(id: string, axeId: string): void {
  if (!ensureEdit()) return;
  const next = clone();
  const m = next.mesures.find((x) => x.id === id);
  if (m) m.axe = axeId;
  void commit(next);
}
function changeDeadline(id: string, dKey: string): void {
  if (!ensureEdit()) return;
  const next = clone();
  const m = next.mesures.find((x) => x.id === id);
  if (m) m.deadline = dKey;
  void commit(next);
}

// Drag-and-drop d'une mesure vers une autre cellule (axe × échéance)
const draggedId = ref<string | null>(null);
function onDragStart(id: string, e: DragEvent): void {
  if (!canEdit.value) return;
  draggedId.value = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
}
function onDragOver(e: DragEvent): void {
  if (!draggedId.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  (e.currentTarget as HTMLElement).classList.add('kanban__cell--drop-target');
}
function onDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('kanban__cell--drop-target');
}
async function onDrop(axeId: string, dKey: string, e: DragEvent): Promise<void> {
  (e.currentTarget as HTMLElement).classList.remove('kanban__cell--drop-target');
  const id = draggedId.value;
  draggedId.value = null;
  if (!id || !ensureEdit()) return;
  const next = clone();
  const m = next.mesures.find((x) => x.id === id);
  if (!m) return;
  m.axe = axeId;
  m.deadline = dKey;
  await commit(next);
}
</script>

<template>
  <div>
    <PageHeader
      title="Politiques publiques"
      subtitle="Mesures de politique publique portées par le projet, classées par axe et par échéance. Chaque mesure peut être rattachée à un ou plusieurs nœuds de l'arborescence."
    />

    <div class="fr-grid-row fr-grid-row--gutters" style="margin-bottom: 1rem">
      <div class="fr-col-12 fr-col-md-5">
        <label class="fr-label" for="mes-search">Rechercher dans les mesures</label>
        <input
          id="mes-search"
          v-model="search"
          type="search"
          placeholder="ex. pompe à chaleur, leasing…"
          class="fr-input"
        />
      </div>
      <div class="fr-col-6 fr-col-md-4">
        <label class="fr-label" for="mes-axe">Axe</label>
        <select id="mes-axe" v-model="filterAxe" class="fr-select">
          <option value="">Tous les axes</option>
          <option v-for="a in axes" :key="a.id" :value="a.id">{{ a.label }}</option>
        </select>
      </div>
      <div class="fr-col-6 fr-col-md-3">
        <label class="fr-label" for="mes-public">Public</label>
        <select id="mes-public" v-model="filterPublic" class="fr-select">
          <option value="">Tous publics</option>
          <option v-for="p in audiences" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
    </div>

    <div class="counters">
      <span class="counter-pill">
        <strong>{{ filtered.length }}</strong> / {{ data.mesures.length }} mesure{{
          data.mesures.length > 1 ? 's' : ''
        }}
        affichée{{ filtered.length > 1 ? 's' : '' }}
      </span>
      <span class="counter-pill">
        <strong>{{ carriedCount }}</strong> portée{{ carriedCount > 1 ? 's' : '' }} par au moins un
        nœud
      </span>
      <span v-for="d in DEADLINES" :key="d.key" class="counter-pill">
        <strong>{{ countByDeadline[d.key] ?? 0 }}</strong> {{ d.label }}
      </span>
    </div>

    <p v-if="canEdit" class="alert alert-info" style="font-size: 0.85rem">
      💡 Cliquez sur le bouton + d'une case pour créer une mesure dans cette combinaison axe ×
      échéance, ou glisser-déposer une carte vers une autre case pour la reclasser.
    </p>

    <div v-if="data.mesures.length === 0 && !canEdit" class="alert alert-info">
      Aucune mesure pour ce projet. Connectez-vous comme éditeur pour en ajouter.
    </div>

    <div class="kanban-mesures" :style="{ '--mes-col-count': DEADLINES.length }">
      <div class="kanban-mesures__row kanban-mesures__row--header">
        <div class="kanban-mesures__row-label">Axes</div>
        <div
          v-for="d in DEADLINES"
          :key="d.key"
          class="kanban__col-header"
          :class="deadlineColorClass(d.key)"
        >
          <span>{{ d.label }}</span>
          <span class="count-badge">{{ countByDeadline[d.key] ?? 0 }}</span>
        </div>
      </div>

      <div v-for="axe in axes" :key="axe.id" class="kanban-mesures__row">
        <div class="kanban__row-label">{{ axe.label }}</div>
        <div
          v-for="d in DEADLINES"
          :key="d.key"
          class="kanban__cell"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop(axe.id, d.key, $event)"
        >
          <article
            v-for="m in cellMesures.get(`${axe.id}:${d.key}`) ?? []"
            :key="m.id"
            class="mesure-mini-card"
            :class="{
              'mesure-mini-card--carried': carriedIds.has(m.id),
              'mesure-mini-card--draggable': canEdit,
              'mesure-mini-card--expanded': expandedId === m.id,
            }"
            :draggable="canEdit"
            @dragstart="onDragStart(m.id, $event)"
          >
            <div class="mesure-mini-card__head">
              <code class="mesure-mini-card__id">{{ m.id }}</code>
              <span
                v-if="carriedIds.has(m.id)"
                class="badge badge-public"
                title="Portée par au moins un nœud"
              >
                ✓ couvert
              </span>
              <span class="spacer"></span>
              <button
                class="fr-btn fr-btn--tertiary fr-btn--sm"
                :title="expandedId === m.id ? 'Replier' : 'Éditer'"
                @click="expandedId = expandedId === m.id ? null : m.id"
              >
                {{ expandedId === m.id ? '▴' : '✎' }}
              </button>
              <button
                v-if="canEdit"
                class="fr-btn fr-btn--tertiary fr-btn--sm"
                style="color: #ce0500"
                title="Supprimer"
                @click="removeMesure(m.id)"
              >
                ×
              </button>
            </div>
            <InlineEdit
              :value="mesureLabel(m)"
              :can-edit="canEdit"
              placeholder="Intitulé de la mesure…"
              display-class="mesure-mini-card__title"
              @update="(v: string) => updateField(m.id, 'title', v)"
              @edit-attempt="ensureEdit"
            />
            <InlineEdit
              v-if="expandedId === m.id || m.summary"
              :value="m.summary ?? ''"
              textarea
              :rows="2"
              :can-edit="canEdit"
              placeholder="Résumé court…"
              display-class="mesure-mini-card__summary"
              @update="(v: string) => updateField(m.id, 'summary', v)"
              @edit-attempt="ensureEdit"
            />
            <div v-if="m.audiences?.length" class="mesure-mini-card__tags">
              <span v-for="p in m.audiences" :key="p" class="fr-tag fr-tag--sm">{{ p }}</span>
            </div>
            <div v-if="expandedId === m.id" class="mesure-mini-card__edit">
              <label class="field">
                <span>Description longue</span>
                <InlineEdit
                  :value="m.description ?? ''"
                  textarea
                  :rows="3"
                  :can-edit="canEdit"
                  placeholder="Détails de la mesure…"
                  @update="(v: string) => updateField(m.id, 'description', v)"
                  @edit-attempt="ensureEdit"
                />
              </label>
              <div class="fr-grid-row fr-grid-row--gutters" style="margin: 0.4rem 0">
                <div class="fr-col-6">
                  <label class="fr-label">Axe</label>
                  <select
                    class="fr-select fr-select--sm"
                    :value="m.axe ?? ''"
                    :disabled="!canEdit"
                    @change="(e) => changeAxe(m.id, (e.target as HTMLSelectElement).value)"
                  >
                    <option v-for="a in axes" :key="a.id" :value="a.id">{{ a.label }}</option>
                  </select>
                </div>
                <div class="fr-col-6">
                  <label class="fr-label">Échéance</label>
                  <select
                    class="fr-select fr-select--sm"
                    :value="deadlineKey(m)"
                    :disabled="!canEdit"
                    @change="(e) => changeDeadline(m.id, (e.target as HTMLSelectElement).value)"
                  >
                    <option v-for="dd in DEADLINES" :key="dd.key" :value="dd.key">
                      {{ dd.label }}
                    </option>
                  </select>
                </div>
              </div>
              <label class="fr-label">Publics ciblés</label>
              <div class="mesure-mini-card__audience-picker">
                <button
                  v-for="a in audiences"
                  :key="a"
                  type="button"
                  class="fr-tag fr-tag--sm"
                  :class="{ 'fr-tag--dismiss': m.audiences?.includes(a) }"
                  :disabled="!canEdit"
                  @click="toggleAudience(m.id, a)"
                >
                  {{ a }}
                </button>
                <small v-if="audiences.length === 0" style="color: #888">
                  Aucun public défini. Ajoutez-en sur d'autres mesures.
                </small>
              </div>
            </div>
          </article>
          <button
            v-if="canEdit"
            class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-add-line fr-btn--icon-left kanban__cell-add"
            title="Ajouter une mesure dans cette case"
            @click="addMesureIn(axe.id, d.key)"
          >
            Mesure
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.counters {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.kanban-mesures {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.kanban-mesures__row {
  display: grid;
  /* Nombre de colonnes piloté par --mes-col-count (= nb d'échéances vocab). */
  grid-template-columns: 180px repeat(var(--mes-col-count, 4), minmax(0, 1fr));
  gap: 0.5rem;
}
@media (max-width: 1100px) {
  .kanban-mesures__row {
    grid-template-columns: 130px repeat(var(--mes-col-count, 4), minmax(0, 1fr));
  }
}
.kanban-mesures__row--header .kanban__col-header {
  border-top-width: 4px;
  padding: 0.6rem 0.7rem;
  font-size: 0.8rem;
}
.kanban__cell {
  transition: background 0.15s;
}
.kanban__cell--drop-target {
  background: var(--background-contrast-info, #d1e4ff);
  outline: 2px dashed var(--text-action-high-blue-france, #000091);
  outline-offset: -2px;
}
.kanban__cell-add {
  margin-top: auto;
  align-self: flex-start;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.kanban__cell-add:hover {
  opacity: 1;
}

.mesure-mini-card {
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.mesure-mini-card--carried {
  border-left: 3px solid var(--text-default-success, #18753c);
}
.mesure-mini-card--draggable {
  cursor: grab;
}
.mesure-mini-card--expanded {
  box-shadow: 0 0 0 2px var(--text-action-high-blue-france, #000091);
}
.mesure-mini-card__head {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.mesure-mini-card__id {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  background: var(--background-alt-blue-france, #e3e3fd);
  color: var(--text-action-high-blue-france, #00146b);
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
  font-weight: 600;
}
.mesure-mini-card :deep(.mesure-mini-card__title) {
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.25;
}
.mesure-mini-card :deep(.mesure-mini-card__summary) {
  font-size: 0.78rem;
  color: var(--text-mention-grey, #555);
  line-height: 1.3;
}
.mesure-mini-card__tags {
  display: flex;
  gap: 0.2rem;
  flex-wrap: wrap;
  margin-top: 0.15rem;
}
.mesure-mini-card__edit {
  border-top: 1px solid var(--border-default-grey, #eee);
  margin-top: 0.4rem;
  padding-top: 0.4rem;
}
.mesure-mini-card__audience-picker {
  display: flex;
  gap: 0.2rem;
  flex-wrap: wrap;
}
.mesure-mini-card__audience-picker .fr-tag {
  cursor: pointer;
  opacity: 0.5;
}
.mesure-mini-card__audience-picker .fr-tag--dismiss {
  opacity: 1;
}
.spacer {
  flex: 1;
}
</style>
