<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { LEGACY_VOCAB, type VocabConfig } from '@latelier/shared';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import {
  useVocabStore,
  useDispositifsStore,
  useMesuresStore,
  useObjectifsStore,
} from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { useConfirm } from '../stores/confirm.js';
import {
  find,
  audiencesFor,
  performMove,
  moveSibling,
  deleteNode,
  addChild,
  updateNode,
  makeNode,
  countNodes,
  pathTo,
} from '../composables/useTreeEditor.js';
import TreeNodeRow from '../components/tree/TreeNodeRow.vue';
import TreePanel from '../components/tree/TreePanel.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { exportProjectBundle, importProjectBundle } from '../api/projects.api.js';

const route = useRoute();
const treeStore = useTreeStore();
const vocabStore = useVocabStore();
const dispositifsStore = useDispositifsStore();
const mesuresStore = useMesuresStore();
const objectifsStore = useObjectifsStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();
const confirmStore = useConfirm();

const slug = computed(() => String(route.params['slug'] ?? ''));

onMounted(async () => {
  if (slug.value) {
    await Promise.all([
      treeStore.hydrate(slug.value),
      vocabStore.hydrate(slug.value),
      dispositifsStore.hydrate(slug.value),
      mesuresStore.hydrate(slug.value),
      objectifsStore.hydrate(slug.value),
    ]);
  }
});

watch(slug, async (s) => {
  if (s) {
    await Promise.all([
      treeStore.hydrate(s),
      vocabStore.hydrate(s),
      dispositifsStore.hydrate(s),
      mesuresStore.hydrate(s),
      objectifsStore.hydrate(s),
    ]);
  }
});

const search = ref('');
const deadlineFilter = ref<string>('all');
const selectedId = ref<string>('root');
const collapsed = ref<Set<string>>(new Set());
const conflictMessage = ref<string | null>(null);

const vocab = computed<VocabConfig>(() => {
  const data = vocabStore.data as VocabConfig | null;
  if (data && Array.isArray(data.audiences)) return data;
  return LEGACY_VOCAB;
});

const root = computed<TreeNode | null>(() => treeStore.tree);

const canEdit = computed(() => {
  if (auth.can('tree:write')) return true;
  return sandbox.isActive(slug.value);
});

const flatList = computed<Array<{ node: TreeNode; depth: number; inherited: readonly string[] }>>(
  () => {
    if (!root.value) return [];
    const out: Array<{ node: TreeNode; depth: number; inherited: readonly string[] }> = [];
    function rec(node: TreeNode, depth: number): void {
      out.push({
        node,
        depth,
        inherited: audiencesFor(root.value as TreeNode, node),
      });
      if (collapsed.value.has(node.id)) return;
      for (const child of node.children ?? []) rec(child, depth + 1);
    }
    rec(root.value, 0);
    return out;
  },
);

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  const dl = deadlineFilter.value;
  return flatList.value.map((item) => {
    const labelMatch =
      !term ||
      item.node.label.toLowerCase().includes(term) ||
      (item.node.tldr ?? '').toLowerCase().includes(term);
    const dlMatch =
      dl === 'all' || (dl === 'none' && !item.node.deadline) || item.node.deadline === dl;
    return { ...item, dim: !(labelMatch && dlMatch) };
  });
});

const stats = computed(() => (root.value ? countNodes(root.value) : { total: 0, maxDepth: 0 }));

const selectedNode = computed(() => {
  if (!root.value) return null;
  return find(root.value, selectedId.value)?.node ?? root.value;
});

// --- Catalogues pour le panel (dispositifs/mesures/objectifs) -------------

interface DispositifLite {
  id: string;
  name: string;
}
const dispositifsCatalog = computed<DispositifLite[]>(() => {
  const raw = dispositifsStore.data as { dispositifs?: Array<Record<string, unknown>> } | null;
  const list = Array.isArray(raw?.dispositifs) ? raw.dispositifs : [];
  return list.map((d, i) => ({
    id: String(d['id'] ?? `dispositif-${i}`),
    name: String(d['name'] ?? d['label'] ?? d['title'] ?? `Dispositif ${i + 1}`),
  }));
});

interface MesureLite {
  id: string;
  label: string;
}
const mesuresCatalog = computed<MesureLite[]>(() => {
  const raw = mesuresStore.data as { mesures?: Array<Record<string, unknown>> } | null;
  const list = Array.isArray(raw?.mesures) ? raw.mesures : [];
  return list.map((m, i) => ({
    id: String(m['id'] ?? `mesure-${i}`),
    label: String(m['label'] ?? m['title'] ?? m['name'] ?? `Mesure ${i + 1}`),
  }));
});

interface MeanLink {
  id: string;
  axeName: string;
  objectiveName: string;
  meanText: string;
}
interface ObjectifsRaw {
  axes?: Array<{
    id?: string;
    name?: string;
    objectives?: Array<{
      id?: string;
      name?: string;
      means?: Array<{ id?: string; text?: string; nodes?: string[] }>;
    }>;
  }>;
}

const allMeans = computed<MeanLink[]>(() => {
  const data = objectifsStore.data as ObjectifsRaw | null;
  if (!data || !Array.isArray(data.axes)) return [];
  const out: MeanLink[] = [];
  for (const axe of data.axes) {
    for (const obj of axe.objectives ?? []) {
      for (const mean of obj.means ?? []) {
        if (!mean.id) continue;
        out.push({
          id: mean.id,
          axeName: String(axe.name ?? ''),
          objectiveName: String(obj.name ?? ''),
          meanText: String(mean.text ?? ''),
        });
      }
    }
  }
  return out;
});

const linkedMeanIds = computed<string[]>(() => {
  if (!selectedNode.value) return [];
  const data = objectifsStore.data as ObjectifsRaw | null;
  if (!data || !Array.isArray(data.axes)) return [];
  const nid = selectedNode.value.id;
  const out: string[] = [];
  for (const axe of data.axes) {
    for (const obj of axe.objectives ?? []) {
      for (const mean of obj.means ?? []) {
        if (mean.id && Array.isArray(mean.nodes) && mean.nodes.includes(nid)) {
          out.push(mean.id);
        }
      }
    }
  }
  return out;
});

async function setLinkedMeans(nextIds: string[]): Promise<void> {
  if (!selectedNode.value) return;
  const nid = selectedNode.value.id;
  const nextSet = new Set(nextIds);
  const data = objectifsStore.data as ObjectifsRaw | null;
  if (!data || !Array.isArray(data.axes)) return;
  // Clone profond + mute chaque mean.nodes selon l'appartenance à nextSet.
  const cloned = JSON.parse(JSON.stringify(data)) as ObjectifsRaw;
  for (const axe of cloned.axes ?? []) {
    for (const obj of axe.objectives ?? []) {
      for (const mean of obj.means ?? []) {
        if (!mean.id) continue;
        const nodes = new Set(mean.nodes ?? []);
        if (nextSet.has(mean.id)) nodes.add(nid);
        else nodes.delete(nid);
        mean.nodes = Array.from(nodes);
      }
    }
  }
  objectifsStore.setData(cloned);
  await objectifsStore.save();
}

// --- Actions tree ---------------------------------------------------------

function onSelect(id: string): void {
  selectedId.value = id;
}

function onToggleCollapse(id: string): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function requireEditOrModal(action: () => void | Promise<void>): void {
  if (canEdit.value) {
    void action();
    return;
  }
  if (auth.user) {
    alert("Vous n'avez pas la permission d'éditer ce projet.");
    return;
  }
  sandbox.openModal('edit');
}

async function applyNextTree(next: TreeNode | null, message = ''): Promise<void> {
  if (!next) return;
  treeStore.setTree(next);
  const result = await treeStore.save(message);
  if (result?.conflict) {
    conflictMessage.value =
      "Une autre personne a modifié l'arbre. Rechargez la page pour récupérer la dernière version.";
  } else {
    conflictMessage.value = null;
  }
}

function onDrop(payload: {
  sourceId: string;
  targetId: string;
  mode: 'before' | 'after' | 'child';
}): void {
  requireEditOrModal(() => {
    if (!root.value) return;
    const next = performMove(root.value, payload.sourceId, payload.targetId, payload.mode);
    if (next) void applyNextTree(next, `Déplacement ${payload.sourceId} (${payload.mode})`);
  });
}

function onPatch(payload: { id: string; patch: Partial<TreeNode> }): void {
  requireEditOrModal(() => {
    if (!root.value) return;
    const next = updateNode(root.value, payload.id, payload.patch);
    if (next) void applyNextTree(next);
  });
}

function onAddChild(): void {
  requireEditOrModal(() => {
    if (!root.value || !selectedNode.value) return;
    const child = makeNode();
    const next = addChild(root.value, selectedNode.value.id, child);
    if (next) {
      const c = collapsed.value;
      if (c.has(selectedNode.value.id)) {
        const nc = new Set(c);
        nc.delete(selectedNode.value.id);
        collapsed.value = nc;
      }
      selectedId.value = child.id;
      void applyNextTree(next, `Ajout sous ${selectedNode.value.id}`);
    }
  });
}

function onDeleteNode(): void {
  requireEditOrModal(async () => {
    if (!root.value || !selectedNode.value) return;
    if (selectedNode.value.id === root.value.id) return;
    const label = selectedNode.value.label;
    const childCount = countNodes(selectedNode.value).total - 1;
    const ok = await confirmStore.ask({
      title: `Supprimer « ${label} » ?`,
      message:
        childCount > 0
          ? `Ce nœud et ses ${childCount} sous-nœud(s) seront supprimés du site. Action irréversible.`
          : 'Le nœud sera supprimé du site. Action irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    const next = deleteNode(root.value, selectedNode.value.id);
    if (next) {
      selectedId.value = 'root';
      void applyNextTree(next, `Suppression ${selectedNode.value.id}`);
    }
  });
}

function onMoveSibling(direction: -1 | 1): void {
  requireEditOrModal(() => {
    if (!root.value || !selectedNode.value) return;
    const next = moveSibling(root.value, selectedNode.value.id, direction);
    if (next) void applyNextTree(next, `Déplacement ${selectedNode.value.id} (${direction})`);
  });
}

function onPromote(): void {
  requireEditOrModal(() => {
    if (!root.value || !selectedNode.value) return;
    const path = pathTo(root.value, selectedNode.value.id);
    if (!path || path.length < 2) {
      alert('Ce nœud est déjà au plus haut niveau possible.');
      return;
    }
    // grandparent = path[path.length-2], parent = path[path.length-1]
    const parent = path[path.length - 1];
    const grandparent = path[path.length - 2];
    if (!parent || !grandparent) return;
    const next = JSON.parse(JSON.stringify(root.value)) as TreeNode;
    const sub = find(next, selectedNode.value.id);
    const parentInClone = find(next, parent.id);
    const grandInClone = find(next, grandparent.id);
    if (!sub || !parentInClone || !grandInClone) return;
    parentInClone.node.children = (parentInClone.node.children ?? []).filter(
      (c) => c.id !== selectedNode.value!.id,
    );
    const arr = grandInClone.node.children ?? [];
    const idx = arr.findIndex((c) => c.id === parent.id);
    arr.splice(idx + 1, 0, sub.node);
    grandInClone.node.children = arr;
    void applyNextTree(next, `Promotion ${selectedNode.value.id}`);
  });
}

function onDemote(): void {
  requireEditOrModal(() => {
    if (!root.value || !selectedNode.value) return;
    const sub = find(root.value, selectedNode.value.id);
    if (!sub?.parent) return;
    const arr = sub.parent.children ?? [];
    const idx = arr.findIndex((c) => c.id === selectedNode.value!.id);
    if (idx <= 0) {
      alert('Aucun frère précédent — il faut un nœud frère avant celui-ci pour le démouvoir.');
      return;
    }
    const next = JSON.parse(JSON.stringify(root.value)) as TreeNode;
    const subInClone = find(next, selectedNode.value.id);
    if (!subInClone?.parent) return;
    const arrClone = subInClone.parent.children ?? [];
    const idxClone = arrClone.findIndex((c) => c.id === selectedNode.value!.id);
    const prevSibling = arrClone[idxClone - 1];
    if (!prevSibling) return;
    arrClone.splice(idxClone, 1);
    prevSibling.children = prevSibling.children ?? [];
    prevSibling.children.push(subInClone.node);
    void applyNextTree(next, `Démouvement ${selectedNode.value.id}`);
  });
}

function onEditAttempt(): void {
  if (!canEdit.value && !auth.user) sandbox.openModal('edit');
}

const saveStatus = computed(() => {
  if (treeStore.saving) return 'saving';
  if (conflictMessage.value) return 'conflict';
  if (treeStore.error) return 'error';
  if (treeStore.dirty) return 'dirty';
  return 'saved';
});

async function handleExportBundle(): Promise<void> {
  try {
    const bundle = await exportProjectBundle(slug.value);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bundle-${slug.value}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(`Export impossible : ${(err as Error).message}`);
  }
}

async function handleImportBundle(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const ok = await confirmStore.ask({
    title: `Importer le bundle « ${file.name} » ?`,
    message:
      "Un nouveau projet sera créé à partir de ce bundle. L'arbre actuel ne sera pas écrasé.",
    confirmLabel: 'Importer',
  });
  if (!ok) {
    input.value = '';
    return;
  }
  try {
    const text = await file.text();
    const bundle = JSON.parse(text) as unknown;
    const created = await importProjectBundle(bundle);
    alert(`Projet importé : ${created.name} (slug : ${created.slug})`);
    input.value = '';
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    const msg = e.response?.data?.detail || e.response?.data?.error || (err as Error).message;
    alert(`Import impossible : ${msg}`);
  }
}
</script>

<template>
  <div v-if="treeStore.loading">Chargement de l'arborescence…</div>
  <div v-else-if="treeStore.error" class="alert alert-error">Erreur : {{ treeStore.error }}</div>
  <div v-else-if="root">
    <PageHeader
      title="Arborescence du hub"
      subtitle="Structure de pages du site : chaque nœud = une page. Drag-and-drop pour réorganiser, clic pour sélectionner et éditer le détail dans le panneau de droite."
    />

    <div class="toolbar">
      <button
        class="fr-btn fr-btn--sm fr-icon-add-line fr-btn--icon-left"
        :disabled="!selectedNode"
        @click="onAddChild"
      >
        Nouvelle rubrique
      </button>
      <RouterLink
        :to="{ name: 'project-history', params: { slug } }"
        class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-history-line fr-btn--icon-left"
      >
        Historique
      </RouterLink>
      <button
        class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-download-line fr-btn--icon-left"
        @click="handleExportBundle"
      >
        Export
      </button>
      <label class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-upload-line fr-btn--icon-left">
        Import
        <input
          type="file"
          accept="application/json"
          style="display: none"
          @change="handleImportBundle"
        />
      </label>
      <span class="spacer"></span>
      <span style="font-size: 0.85rem; color: #555">
        {{ stats.total }} nœud{{ stats.total > 1 ? 's' : '' }} · profondeur {{ stats.maxDepth }}
      </span>
      <span class="save-status" :class="`save-status--${saveStatus}`">
        {{
          saveStatus === 'saving'
            ? 'Sauvegarde…'
            : saveStatus === 'dirty'
              ? 'Modifications non sauvegardées'
              : saveStatus === 'saved'
                ? `Enregistré · révision #${treeStore.revision?.id ?? '—'}`
                : ''
        }}
      </span>
    </div>

    <!-- Filtres globaux : recherche libre + filtre par échéance.
         Layout 2 colonnes au-dessus du master-détail comme le legacy. -->
    <div class="fr-grid-row fr-grid-row--gutters tree-filters">
      <div class="fr-col-12 fr-col-md-7">
        <label class="fr-label" for="tree-search">Rechercher un nœud par libellé ou TL;DR</label>
        <input
          id="tree-search"
          v-model="search"
          type="search"
          placeholder="ex. leasing, carte, simulateur…"
          class="fr-input"
        />
      </div>
      <div class="fr-col-12 fr-col-md-5">
        <label class="fr-label" for="tree-deadline">Filtrer par échéance</label>
        <select id="tree-deadline" v-model="deadlineFilter" class="fr-select">
          <option value="all">Toutes les échéances</option>
          <option v-for="d in vocab.deadlines" :key="d.key" :value="d.key">{{ d.label }}</option>
          <option value="none">Sans échéance</option>
        </select>
      </div>
    </div>

    <div class="tree-layout">
      <div class="tree-main">
        <!-- Légende des types -->
        <div class="legend">
          <span
            v-for="t in vocab.page_types"
            :key="t.key"
            class="type-pill"
            :class="`type-${t.key}`"
          >
            {{ t.label }}
          </span>
        </div>

        <div v-if="conflictMessage" class="alert alert-warning">{{ conflictMessage }}</div>
        <div
          v-if="treeStore.persistTarget === 'local' && treeStore.localSavedAt"
          class="alert alert-info"
          style="font-size: 0.85rem"
        >
          Modifications locales sauvegardées (bac à sable).
        </div>

        <div class="tree-list" role="tree">
          <TreeNodeRow
            v-for="item in filtered"
            :key="item.node.id"
            :node="item.node"
            :depth="item.depth"
            :selected-id="selectedId"
            :collapsed="collapsed"
            :inherited-audiences="item.inherited"
            :vocab="vocab"
            :can-edit="canEdit"
            :is-root="item.node.id === root.id"
            :style="{ opacity: item.dim ? 0.4 : 1 }"
            @select="onSelect"
            @toggle-collapse="onToggleCollapse"
            @drop-here="onDrop"
          />
        </div>
      </div>

      <div class="tree-side">
        <TreePanel
          :node="selectedNode"
          :root="root"
          :is-root="selectedNode?.id === root.id"
          :vocab="vocab"
          :can-edit="canEdit"
          :slug="slug"
          :dispositifs-catalog="dispositifsCatalog"
          :mesures-catalog="mesuresCatalog"
          :all-means="allMeans"
          :linked-mean-ids="linkedMeanIds"
          @set-linked-means="setLinkedMeans"
          @patch="onPatch"
          @add-child="onAddChild"
          @delete-node="onDeleteNode"
          @move-sibling="onMoveSibling"
          @promote="onPromote"
          @demote="onDemote"
          @edit-attempt="onEditAttempt"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-filters {
  margin: 0.5rem 0 1rem;
}
.tree-layout {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .tree-layout {
    grid-template-columns: 1fr;
  }
}
.tree-list {
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background: white;
}
</style>
