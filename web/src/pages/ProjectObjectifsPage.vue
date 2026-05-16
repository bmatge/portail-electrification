<script setup lang="ts">
// Page Objectifs : pyramide stratégique à 3 niveaux (axes → objectifs →
// moyens) avec liaison aux nœuds de l'arborescence.
//
// Structure data attendue côté serveur :
//   { axes: [{ id, name, description, objectives: [{ id, name, means: [{ id, text, nodes: [], dispositifs: [] }] }] }] }

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useObjectifsStore } from '../stores/data.js';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { useConfirm } from '../stores/confirm.js';
import { useCanEdit } from '../composables/useCanEdit.js';
import PageHeader from '../components/ui/PageHeader.vue';
import InlineEdit from '../components/ui/InlineEdit.vue';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const store = useObjectifsStore();
const treeStore = useTreeStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();
const confirmStore = useConfirm();

interface Mean {
  id: string;
  text: string;
  nodes?: string[];
  dispositifs?: string[];
}
interface Objective {
  id: string;
  name: string;
  means: Mean[];
}
interface Axe {
  id: string;
  name: string;
  description?: string;
  objectives: Objective[];
}
interface ObjectifsData {
  meta?: {
    promise?: string;
    [k: string]: unknown;
  };
  axes: Axe[];
}

function newId(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}

onMounted(async () => {
  if (slug.value) {
    await Promise.all([store.hydrate(slug.value), treeStore.hydrate(slug.value)]);
  }
});
watch(slug, async (s) => {
  if (s) await Promise.all([store.hydrate(s), treeStore.hydrate(s)]);
});

const canEdit = useCanEdit('data:write', () => slug.value);

const data = computed<ObjectifsData>(() => {
  const raw = store.data as ObjectifsData | null;
  if (raw && Array.isArray(raw.axes)) return raw;
  return { axes: [] };
});

const search = ref('');

// Index des nœuds par id avec leur profondeur (L0/L1/L2…) pour les chips
const nodeIndex = computed<Map<string, { node: TreeNode; depth: number; path: string[] }>>(() => {
  const out = new Map<string, { node: TreeNode; depth: number; path: string[] }>();
  const root = treeStore.tree;
  if (!root) return out;
  const walk = (n: TreeNode, depth: number, path: string[]): void => {
    const nextPath = [...path, n.label];
    out.set(n.id, { node: n, depth, path: nextPath });
    for (const c of n.children ?? []) walk(c, depth + 1, nextPath);
  };
  walk(root, 0, []);
  return out;
});

// Compte de couverture : nb total de mesures (= moyens) portées par >=1 nœud
const totalMeans = computed(() => {
  let n = 0;
  for (const a of data.value.axes) for (const o of a.objectives) n += o.means.length;
  return n;
});
const carriedMeans = computed(() => {
  let n = 0;
  for (const a of data.value.axes)
    for (const o of a.objectives) for (const m of o.means) if ((m.nodes ?? []).length > 0) n++;
  return n;
});

// Filtrage par recherche : on garde axe/objectif/moyen si search matche
function matchesSearch(text: string): boolean {
  const term = search.value.trim().toLowerCase();
  if (!term) return true;
  return text.toLowerCase().includes(term);
}

const filtered = computed<Axe[]>(() => {
  if (!search.value.trim()) return data.value.axes;
  return data.value.axes
    .map((a) => {
      const objectives = a.objectives
        .map((o) => {
          const means = o.means.filter((m) => matchesSearch(m.text));
          if (matchesSearch(o.name) || means.length)
            return { ...o, means: means.length ? means : o.means };
          return null;
        })
        .filter((x): x is Objective => x !== null);
      if (matchesSearch(a.name) || objectives.length) return { ...a, objectives };
      return null;
    })
    .filter((x): x is Axe => x !== null);
});

function ensureEditOrModal(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

async function commit(next: ObjectifsData): Promise<void> {
  store.setData(next);
  await store.save();
}

function clone(): ObjectifsData {
  return JSON.parse(JSON.stringify(data.value)) as ObjectifsData;
}

function addAxe(): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  next.axes.push({ id: newId('a'), name: 'Nouvel axe', description: '', objectives: [] });
  void commit(next);
}
function renameAxe(id: string, name: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const axe = next.axes.find((a) => a.id === id);
  if (axe) axe.name = name;
  void commit(next);
}
function describeAxe(id: string, description: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const axe = next.axes.find((a) => a.id === id);
  if (axe) axe.description = description;
  void commit(next);
}
function moveAxe(id: string, dir: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const i = next.axes.findIndex((a) => a.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= next.axes.length) return;
  const a = next.axes[i];
  const b = next.axes[j];
  if (!a || !b) return;
  next.axes[i] = b;
  next.axes[j] = a;
  void commit(next);
}
async function removeAxe(id: string): Promise<void> {
  if (!ensureEditOrModal()) return;
  const axe = data.value.axes.find((a) => a.id === id);
  if (!axe) return;
  const objCount = axe.objectives.length;
  const meanCount = axe.objectives.reduce((s, o) => s + o.means.length, 0);
  const askOpts: { title: string; confirmLabel: string; danger: true; message?: string } = {
    title: `Supprimer l'axe « ${axe.name} » ?`,
    confirmLabel: 'Supprimer',
    danger: true,
  };
  if (objCount || meanCount) {
    askOpts.message = `${objCount} objectif(s) et ${meanCount} moyen(s) rattachés seront aussi supprimés.`;
  }
  const ok = await confirmStore.ask(askOpts);
  if (!ok) return;
  const next = clone();
  next.axes = next.axes.filter((a) => a.id !== id);
  void commit(next);
}

function addObjective(axeId: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const axe = next.axes.find((a) => a.id === axeId);
  if (!axe) return;
  axe.objectives.push({ id: newId('o'), name: 'Nouvel objectif', means: [] });
  void commit(next);
}
function renameObjective(axeId: string, objId: string, name: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const obj = next.axes.find((a) => a.id === axeId)?.objectives.find((o) => o.id === objId);
  if (obj) obj.name = name;
  void commit(next);
}
async function removeObjective(axeId: string, objId: string): Promise<void> {
  if (!ensureEditOrModal()) return;
  const axe = data.value.axes.find((a) => a.id === axeId);
  const obj = axe?.objectives.find((o) => o.id === objId);
  if (!obj) return;
  const askOpts: { title: string; confirmLabel: string; danger: true; message?: string } = {
    title: `Supprimer l'objectif « ${obj.name} » ?`,
    confirmLabel: 'Supprimer',
    danger: true,
  };
  if (obj.means.length) {
    askOpts.message = `${obj.means.length} moyen(s) rattachés seront aussi supprimés.`;
  }
  const ok = await confirmStore.ask(askOpts);
  if (!ok) return;
  const next = clone();
  const a = next.axes.find((x) => x.id === axeId);
  if (a) a.objectives = a.objectives.filter((o) => o.id !== objId);
  void commit(next);
}

function addMean(axeId: string, objId: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const obj = next.axes.find((a) => a.id === axeId)?.objectives.find((o) => o.id === objId);
  if (obj) obj.means.push({ id: newId('m'), text: 'Nouveau moyen', nodes: [], dispositifs: [] });
  void commit(next);
}
function renameMean(axeId: string, objId: string, meanId: string, text: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const m = next.axes
    .find((a) => a.id === axeId)
    ?.objectives.find((o) => o.id === objId)
    ?.means.find((x) => x.id === meanId);
  if (m) m.text = text;
  void commit(next);
}
function removeMean(axeId: string, objId: string, meanId: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const obj = next.axes.find((a) => a.id === axeId)?.objectives.find((o) => o.id === objId);
  if (obj) obj.means = obj.means.filter((m) => m.id !== meanId);
  void commit(next);
}

function unlinkNode(axeId: string, objId: string, meanId: string, nodeId: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const m = next.axes
    .find((a) => a.id === axeId)
    ?.objectives.find((o) => o.id === objId)
    ?.means.find((x) => x.id === meanId);
  if (m) m.nodes = (m.nodes ?? []).filter((n) => n !== nodeId);
  void commit(next);
}

function linkNode(axeId: string, objId: string, meanId: string): void {
  if (!ensureEditOrModal()) return;
  const all = Array.from(nodeIndex.value.values());
  if (all.length === 0) {
    alert("Aucun nœud dans l'arborescence pour le moment.");
    return;
  }
  const list = all.map((x) => `${x.node.id} — L${x.depth} ${x.path.join(' › ')}`).join('\n');
  const ans = prompt(
    `Coller l'id du nœud à rattacher au moyen.\n\nArbre actuel :\n${list}\n\nID :`,
  );
  if (!ans) return;
  const target = ans.trim();
  if (!nodeIndex.value.has(target)) {
    alert(`Aucun nœud avec l'id « ${target} ».`);
    return;
  }
  const next = clone();
  const m = next.axes
    .find((a) => a.id === axeId)
    ?.objectives.find((o) => o.id === objId)
    ?.means.find((x) => x.id === meanId);
  if (m) {
    m.nodes = m.nodes ?? [];
    if (!m.nodes.includes(target)) m.nodes.push(target);
  }
  void commit(next);
}

function axeAcronym(name: string): string {
  const words = name.split(/[\s\-—]+/).filter(Boolean);
  if (words.length >= 2)
    return words[0]!.slice(0, 2).toUpperCase() + (words[1]?.[0] ?? '').toUpperCase();
  const first = words[0] ?? name;
  return first.slice(0, 3).toUpperCase();
}

async function clearAll(): Promise<void> {
  if (!ensureEditOrModal()) return;
  const ok = await confirmStore.ask({
    title: 'Vider toute la pyramide ?',
    message: 'Tous les axes, objectifs et moyens seront supprimés. Action irréversible.',
    confirmLabel: 'Tout vider',
    danger: true,
  });
  if (!ok) return;
  void commit({ axes: [] });
}

async function exportJson(): Promise<void> {
  const blob = new Blob([JSON.stringify(data.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `objectifs-${slug.value}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importJson(event: Event): Promise<void> {
  if (!ensureEditOrModal()) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as ObjectifsData;
    if (!Array.isArray(parsed.axes)) {
      alert('Format invalide : attendu { axes: [...] }');
      return;
    }
    const ok = await confirmStore.ask({
      title: `Importer ${parsed.axes.length} axe(s) ?`,
      message: 'Le contenu actuel de la pyramide sera remplacé. Action irréversible.',
      confirmLabel: 'Remplacer',
      danger: true,
    });
    if (!ok) return;
    await commit(parsed);
    input.value = '';
  } catch (e) {
    alert(`Import impossible : ${(e as Error).message}`);
  }
}
</script>

<template>
  <div v-if="store.loading">Chargement…</div>
  <div v-else>
    <PageHeader
      title="Objectifs du site"
      subtitle="Pyramide stratégique du hub : axes, objectifs et moyens portés par le site, avec leur couverture par l'arborescence."
    />

    <div class="toolbar">
      <button class="fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left" @click="addAxe">
        Ajouter un axe
      </button>
      <button
        class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-download-line fr-btn--icon-left"
        @click="exportJson"
      >
        Export
      </button>
      <label class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-upload-line fr-btn--icon-left">
        Import
        <input type="file" accept="application/json" style="display: none" @change="importJson" />
      </label>
      <button
        v-if="data.axes.length"
        class="fr-btn fr-btn--sm fr-btn--tertiary"
        style="color: #ce0500"
        @click="clearAll"
      >
        Vider la pyramide
      </button>
      <span class="spacer"></span>
      <span style="font-size: 0.85rem; color: #555">
        {{ carriedMeans }} / {{ totalMeans }} moyens couverts par un nœud
      </span>
    </div>

    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        placeholder="🔍 Rechercher dans la pyramide…"
        class="fr-input fr-input--sm"
        style="flex: 1"
      />
    </div>

    <blockquote v-if="data.meta?.promise" class="promise-callout">
      « {{ data.meta.promise }} »
    </blockquote>

    <p
      v-if="store.persistTarget === 'local' && store.localSavedAt"
      class="alert alert-info"
      style="font-size: 0.85rem"
    >
      Modifications locales sauvegardées (bac à sable).
    </p>

    <p v-if="data.axes.length === 0" class="alert alert-info">
      Pyramide vide. Commencez par ajouter un axe stratégique.
    </p>

    <article v-for="axe in filtered" :key="axe.id" class="axe-card">
      <header class="axe-card__head">
        <div class="avatar-axis" :title="axe.name">{{ axeAcronym(axe.name) }}</div>
        <div class="axe-card__title-zone">
          <InlineEdit
            :value="axe.name"
            :can-edit="canEdit"
            placeholder="Nom de l'axe…"
            display-class="axe-card__name"
            @update="(v: string) => renameAxe(axe.id, v)"
            @edit-attempt="ensureEditOrModal"
          />
          <InlineEdit
            :value="axe.description ?? ''"
            :can-edit="canEdit"
            placeholder="Description (optionnel)…"
            display-class="axe-card__desc"
            @update="(v: string) => describeAxe(axe.id, v)"
            @edit-attempt="ensureEditOrModal"
          />
        </div>
        <div class="axe-card__actions">
          <button class="fr-btn fr-btn--tertiary fr-btn--sm" @click="moveAxe(axe.id, -1)">↑</button>
          <button class="fr-btn fr-btn--tertiary fr-btn--sm" @click="moveAxe(axe.id, 1)">↓</button>
          <button
            class="fr-btn fr-btn--tertiary fr-btn--sm"
            style="color: #ce0500"
            @click="removeAxe(axe.id)"
          >
            ×
          </button>
        </div>
      </header>

      <div v-for="obj in axe.objectives" :key="obj.id" class="obj-block">
        <div class="obj-block__head">
          <span class="pyramid-pill pyramid-pill--objectif">Objectif</span>
          <InlineEdit
            :value="obj.name"
            :can-edit="canEdit"
            placeholder="Énoncé de l'objectif…"
            display-class="obj-block__name"
            @update="(v: string) => renameObjective(axe.id, obj.id, v)"
            @edit-attempt="ensureEditOrModal"
          />
          <span class="spacer"></span>
          <button
            class="fr-btn fr-btn--tertiary fr-btn--sm"
            style="color: #ce0500"
            @click="removeObjective(axe.id, obj.id)"
          >
            ×
          </button>
        </div>

        <ul class="means-list">
          <li v-for="m in obj.means" :key="m.id" class="mean-row">
            <span class="pyramid-pill pyramid-pill--moyen">Moyen</span>
            <div class="mean-row__content">
              <InlineEdit
                :value="m.text"
                :can-edit="canEdit"
                placeholder="Énoncé du moyen (action concrète)…"
                @update="(v: string) => renameMean(axe.id, obj.id, m.id, v)"
                @edit-attempt="ensureEditOrModal"
              />
              <div class="mean-row__chips">
                <span
                  v-for="nid in m.nodes ?? []"
                  :key="nid"
                  class="pyramid-pill pyramid-pill--node node-chip"
                  :title="nodeIndex.get(nid)?.path.join(' › ') ?? nid"
                >
                  L{{ nodeIndex.get(nid)?.depth ?? '?' }}
                  {{ nodeIndex.get(nid)?.node.label ?? nid }}
                  <button
                    v-if="canEdit"
                    class="node-chip__remove"
                    title="Délier ce nœud"
                    @click.stop="unlinkNode(axe.id, obj.id, m.id, nid)"
                  >
                    ×
                  </button>
                </span>
                <button
                  v-if="canEdit"
                  class="fr-btn fr-btn--tertiary fr-btn--sm"
                  @click="linkNode(axe.id, obj.id, m.id)"
                >
                  + lier un nœud
                </button>
                <span
                  v-if="(m.nodes ?? []).length === 0"
                  class="badge"
                  style="background: #fbeae1; color: #553f00"
                  title="Ce moyen n'est encore rattaché à aucun nœud du hub"
                >
                  ⚠ non couvert
                </span>
              </div>
            </div>
            <button
              v-if="canEdit"
              class="fr-btn fr-btn--tertiary fr-btn--sm"
              style="color: #ce0500"
              @click="removeMean(axe.id, obj.id, m.id)"
            >
              ×
            </button>
          </li>
        </ul>
        <button
          v-if="canEdit"
          class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-add-line fr-btn--icon-left"
          @click="addMean(axe.id, obj.id)"
        >
          Moyen
        </button>
      </div>

      <button
        v-if="canEdit"
        class="fr-btn fr-btn--secondary fr-btn--sm fr-icon-add-line fr-btn--icon-left"
        style="margin-top: 0.5rem"
        @click="addObjective(axe.id)"
      >
        Objectif
      </button>
    </article>
  </div>
</template>

<style scoped>
.axe-card {
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.axe-card__head {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.8rem;
}
.axe-card__title-zone {
  flex: 1;
  min-width: 0;
}
.axe-card :deep(.axe-card__name) {
  font-size: 1.1rem;
  font-weight: 700;
  display: block;
}
.axe-card :deep(.axe-card__desc) {
  font-size: 0.9rem;
  color: var(--text-mention-grey, #666);
  display: block;
  margin-top: 0.2rem;
}
.axe-card__actions {
  display: flex;
  gap: 0.25rem;
}

.obj-block {
  border-left: 3px solid var(--text-action-high-blue-france, #000091);
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  background: #fafaff;
  border-radius: 0 4px 4px 0;
}
.obj-block__head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.4rem;
}
.obj-block :deep(.obj-block__name) {
  font-weight: 600;
  flex: 1;
}

.means-list {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0;
}
.mean-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.3rem 0;
  border-bottom: 1px dashed #eee;
}
.mean-row:last-child {
  border-bottom: none;
}
.mean-row__content {
  flex: 1;
  min-width: 0;
}
.mean-row__chips {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin-top: 0.3rem;
  align-items: center;
}
.node-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: default;
}
.node-chip__remove {
  background: none;
  border: none;
  color: #1c4a0e;
  cursor: pointer;
  padding: 0 0.2rem;
  font-weight: bold;
  font-size: 0.9rem;
}
.node-chip__remove:hover {
  color: #ce0500;
}
.spacer {
  flex: 1;
}
</style>
