<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { LEGACY_VOCAB, type VocabConfig } from '@latelier/shared';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useVocabStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
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
} from '../composables/useTreeEditor.js';
import TreeNodeRow from '../components/tree/TreeNodeRow.vue';
import TreePanel from '../components/tree/TreePanel.vue';

const route = useRoute();
const treeStore = useTreeStore();
const vocabStore = useVocabStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();

const slug = computed(() => String(route.params['slug'] ?? ''));

onMounted(async () => {
  if (slug.value) {
    await Promise.all([treeStore.hydrate(slug.value), vocabStore.hydrate(slug.value)]);
  }
});

watch(slug, async (s) => {
  if (s) {
    await Promise.all([treeStore.hydrate(s), vocabStore.hydrate(s)]);
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

function onSelect(id: string): void {
  selectedId.value = id;
}

function onToggleCollapse(id: string): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function requireEditOrModal(action: () => void): void {
  if (canEdit.value) {
    action();
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
  requireEditOrModal(() => {
    if (!root.value || !selectedNode.value) return;
    if (selectedNode.value.id === root.value.id) return;
    if (!confirm(`Supprimer « ${selectedNode.value.label} » et sa descendance ?`)) return;
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

function onEditAttempt(): void {
  if (!canEdit.value && !auth.user) sandbox.openModal('edit');
}
</script>

<template>
  <div v-if="treeStore.loading">Chargement de l'arborescence…</div>
  <div v-else-if="treeStore.error" class="alert alert-error">Erreur : {{ treeStore.error }}</div>
  <div v-else-if="root" class="tree-layout">
    <div class="tree-main">
      <div class="toolbar">
        <input
          v-model="search"
          type="search"
          placeholder="Rechercher dans l'arbre…"
          class="input"
          style="flex: 1; min-width: 200px"
        />
        <select v-model="deadlineFilter" class="input">
          <option value="all">Toutes échéances</option>
          <option v-for="d in vocab.deadlines" :key="d.key" :value="d.key">{{ d.label }}</option>
          <option value="none">Sans échéance</option>
        </select>
        <button class="btn" type="button" :disabled="!selectedNode" @click="onAddChild">
          + Sous-rubrique
        </button>
        <span class="spacer"></span>
        <span style="font-size: 0.85rem; color: #555">
          {{ stats.total }} nœuds · profondeur {{ stats.maxDepth }}
        </span>
        <span v-if="treeStore.saving" style="color: #555">Sauvegarde…</span>
        <span v-else-if="treeStore.dirty" style="color: #b88600">●</span>
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
        :is-root="selectedNode?.id === root.id"
        :vocab="vocab"
        :can-edit="canEdit"
        @patch="onPatch"
        @add-child="onAddChild"
        @delete-node="onDeleteNode"
        @move-sibling="onMoveSibling"
        @edit-attempt="onEditAttempt"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 1rem;
}
@media (max-width: 900px) {
  .tree-layout {
    grid-template-columns: 1fr;
  }
}
.tree-list {
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  background: white;
}
</style>
