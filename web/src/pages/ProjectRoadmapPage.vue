<script setup lang="ts">
// Roadmap : grille échéances × (types|publics), dérivée de l'arbre.
// Lit l'arbre via useTreeStore, affiche un croisement des nœuds qui ont
// une deadline et un type (ou un public hérité) + les `improvements`
// portés par chaque nœud. Pas de persistance dédiée pour cette vue :
// les modifications passent par la page Arborescence.

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { LEGACY_VOCAB, type VocabConfig } from '@latelier/shared';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useVocabStore } from '../stores/data.js';
import { audiencesFor } from '../composables/useTreeEditor.js';

const route = useRoute();
const treeStore = useTreeStore();
const vocabStore = useVocabStore();
const slug = computed(() => String(route.params['slug'] ?? ''));

onMounted(async () => {
  if (slug.value) {
    await Promise.all([treeStore.hydrate(slug.value), vocabStore.hydrate(slug.value)]);
  }
});

watch(slug, async (s) => {
  if (s) await Promise.all([treeStore.hydrate(s), vocabStore.hydrate(s)]);
});

const mode = ref<'types' | 'audiences'>('types');
const search = ref('');

const vocab = computed<VocabConfig>(() => {
  const data = vocabStore.data as VocabConfig | null;
  if (data && Array.isArray(data.audiences)) return data;
  return LEGACY_VOCAB;
});

interface Card {
  kind: 'node' | 'improvement';
  node: TreeNode;
  improvement?: { id: string; title: string; description: string };
}

interface ImprovementLike {
  id?: string;
  deadline?: string;
  title?: string;
  description?: string;
}

const grid = computed<Map<string, Map<string, Card[]>>>(() => {
  const out = new Map<string, Map<string, Card[]>>();
  const root = treeStore.tree;
  if (!root) return out;
  const rows = mode.value === 'types' ? vocab.value.page_types : vocab.value.audiences;
  const cols = vocab.value.deadlines.map((d) => d.key);
  for (const r of rows) {
    out.set(r.key, new Map(cols.map((c) => [c, [] as Card[]])));
  }

  function rec(node: TreeNode): void {
    if (node.id !== root!.id) {
      const rowKeys =
        mode.value === 'types'
          ? Array.isArray(node.types) && node.types.length
            ? node.types
            : node.type
              ? [node.type]
              : []
          : Array.from(audiencesFor(root!, node));
      const dl = node.deadline ?? '';
      if (dl && cols.includes(dl)) {
        for (const rk of rowKeys) {
          out.get(rk)?.get(dl)?.push({ kind: 'node', node });
        }
      }
      const imps = Array.isArray(node['improvements'])
        ? (node['improvements'] as ImprovementLike[])
        : [];
      for (const imp of imps) {
        if (!imp.deadline || !cols.includes(imp.deadline)) continue;
        for (const rk of rowKeys) {
          out
            .get(rk)
            ?.get(imp.deadline)
            ?.push({
              kind: 'improvement',
              node,
              improvement: {
                id: imp.id ?? '',
                title: imp.title ?? '',
                description: imp.description ?? '',
              },
            });
        }
      }
    }
    for (const child of node.children ?? []) rec(child);
  }
  rec(root);
  return out;
});

const cardMatchesSearch = (card: Card): boolean => {
  const term = search.value.trim().toLowerCase();
  if (!term) return true;
  const haystack = [
    card.node.label,
    card.node.tldr ?? '',
    card.improvement?.title ?? '',
    card.improvement?.description ?? '',
  ].join(' ');
  return haystack.toLowerCase().includes(term);
};

const visibleRows = computed(() => {
  const rows = mode.value === 'types' ? vocab.value.page_types : vocab.value.audiences;
  return rows.filter((r) => {
    const cells = grid.value.get(r.key);
    if (!cells) return false;
    for (const arr of cells.values()) {
      if (arr.some(cardMatchesSearch)) return true;
    }
    return false;
  });
});

const stats = computed(() => {
  let nodes = 0;
  let imps = 0;
  for (const colMap of grid.value.values()) {
    for (const items of colMap.values()) {
      for (const it of items) {
        if (!cardMatchesSearch(it)) continue;
        if (it.kind === 'node') nodes++;
        else imps++;
      }
    }
  }
  return { nodes, imps };
});
</script>

<template>
  <div v-if="treeStore.loading">Chargement…</div>
  <div v-else-if="treeStore.error" class="alert alert-error">Erreur : {{ treeStore.error }}</div>
  <div v-else-if="treeStore.tree">
    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        placeholder="Rechercher…"
        class="input"
        style="flex: 1"
      />
      <select v-model="mode" class="input">
        <option value="types">Lignes : types de page</option>
        <option value="audiences">Lignes : publics cibles</option>
      </select>
      <span class="spacer"></span>
      <span style="font-size: 0.85rem; color: #555">
        {{ stats.nodes }} nœuds · {{ stats.imps }} améliorations
      </span>
    </div>
    <div v-if="visibleRows.length === 0" style="padding: 1rem; color: #555">
      Aucune ligne à afficher — ajoutez échéance + type (ou public) sur les nœuds depuis
      l'arborescence.
    </div>
    <div
      v-else
      class="roadmap-grid"
      :style="{ gridTemplateColumns: `180px repeat(${vocab.deadlines.length}, 1fr)` }"
    >
      <div></div>
      <div v-for="col in vocab.deadlines" :key="col.key" class="roadmap-col-header">
        {{ col.label }}
      </div>
      <template v-for="row in visibleRows" :key="row.key">
        <div class="roadmap-row-header">{{ row.label }}</div>
        <div v-for="col in vocab.deadlines" :key="col.key + '-' + row.key" class="roadmap-cell">
          <template
            v-for="card in (grid.get(row.key)?.get(col.key) ?? []).filter(cardMatchesSearch)"
            :key="card.kind + '-' + card.node.id + '-' + (card.improvement?.id ?? '')"
          >
            <div class="roadmap-card" :class="{ 'roadmap-card--imp': card.kind === 'improvement' }">
              <strong>
                {{ card.kind === 'improvement' ? card.improvement?.title : card.node.label }}
              </strong>
              <div v-if="card.improvement?.description" style="font-size: 0.8rem; color: #555">
                {{ card.improvement.description }}
              </div>
              <div v-else-if="card.node.tldr" style="font-size: 0.8rem; color: #555">
                {{ card.node.tldr }}
              </div>
              <small v-if="card.kind === 'improvement'" style="color: #888">
                via {{ card.node.label }}
              </small>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.roadmap-grid {
  display: grid;
  gap: 0.25rem;
  background: #e5e5e5;
}
.roadmap-col-header,
.roadmap-row-header {
  background: white;
  padding: 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
}
.roadmap-col-header {
  text-align: center;
  border-bottom: 2px solid #000091;
}
.roadmap-row-header {
  border-right: 2px solid #000091;
  display: flex;
  align-items: center;
}
.roadmap-cell {
  background: #fafafa;
  padding: 0.4rem;
  min-height: 50px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.roadmap-card {
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
}
.roadmap-card--imp {
  border-left: 3px solid #ff9800;
}
</style>
