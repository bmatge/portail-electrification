<script setup lang="ts">
// Roadmap : grille X × Y configurable, dérivée de l'arbre.
// L'utilisateur choisit deux dimensions parmi {types de page, publics
// cibles, échéances}. Quand l'axe X = échéances et qu'un nœud est
// déplacé d'une colonne à l'autre, on met à jour `node.deadline`.
//
// Note "bug 2027+" relevé en audit : le seed `tree.json` du projet
// portail-electrification a 43 nœuds tous deadline="y2027". La
// concentration en colonne 2027+ reflète donc les données seed, pas
// un défaut de code.

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LEGACY_VOCAB, type VocabConfig } from '@latelier/shared';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useVocabStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { audiencesFor, updateNode } from '../composables/useTreeEditor.js';
import InlineEdit from '../components/ui/InlineEdit.vue';
import PageHeader from '../components/ui/PageHeader.vue';

const route = useRoute();
const router = useRouter();
const treeStore = useTreeStore();
const vocabStore = useVocabStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();
const slug = computed(() => String(route.params['slug'] ?? ''));

const canEdit = computed(() => {
  if (auth.can('tree:write')) return true;
  return sandbox.isActive(slug.value);
});

function ensureEdit(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

async function updateImprovement(
  nodeId: string,
  impId: string,
  field: 'title' | 'description' | 'deadline',
  value: string,
): Promise<void> {
  if (!ensureEdit()) return;
  if (!treeStore.tree) return;
  const nextTree = JSON.parse(JSON.stringify(treeStore.tree)) as TreeNode;
  function rec(n: TreeNode): boolean {
    if (n.id === nodeId) {
      const imps = Array.isArray(n['improvements'])
        ? (n['improvements'] as Array<Record<string, unknown>>)
        : [];
      const imp = imps.find((it) => it['id'] === impId);
      if (imp) {
        imp[field] = value;
        return true;
      }
    }
    for (const c of n.children ?? []) if (rec(c)) return true;
    return false;
  }
  if (rec(nextTree)) {
    const finalTree = updateNode(nextTree, nextTree.id, {});
    treeStore.setTree(finalTree ?? nextTree);
    await treeStore.save(`Édition improvement ${impId} sur ${nodeId}`);
  }
}

onMounted(async () => {
  if (slug.value) {
    await Promise.all([treeStore.hydrate(slug.value), vocabStore.hydrate(slug.value)]);
  }
});

watch(slug, async (s) => {
  if (s) await Promise.all([treeStore.hydrate(s), vocabStore.hydrate(s)]);
});

type Dimension = 'page_types' | 'audiences' | 'deadlines';

const yAxis = ref<Dimension>('page_types');
const xAxis = ref<Dimension>('deadlines');
const search = ref('');

// Garantit que xAxis ≠ yAxis : si on choisit la même dimension en Y, on
// déplace X sur la précédente Y.
watch(yAxis, (newY, oldY) => {
  if (newY === xAxis.value) xAxis.value = oldY;
});
watch(xAxis, (newX, oldX) => {
  if (newX === yAxis.value) yAxis.value = oldX;
});

const vocab = computed<VocabConfig>(() => {
  const data = vocabStore.data as VocabConfig | null;
  if (data && Array.isArray(data.audiences)) return data;
  return LEGACY_VOCAB;
});

function entriesFor(d: Dimension): readonly { key: string; label: string }[] {
  return vocab.value[d];
}

function nodeKeysFor(d: Dimension, node: TreeNode, root: TreeNode): string[] {
  if (d === 'page_types') {
    if (Array.isArray(node.types) && node.types.length) return [...node.types];
    if (node.page_type) return [node.page_type];
    if (node.type) return [node.type];
    return [];
  }
  if (d === 'audiences') return Array.from(audiencesFor(root, node));
  if (d === 'deadlines') return node.deadline ? [node.deadline] : [];
  return [];
}

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
  const ys = entriesFor(yAxis.value);
  const xs = entriesFor(xAxis.value);
  for (const y of ys) {
    out.set(y.key, new Map(xs.map((x) => [x.key, [] as Card[]])));
  }

  function rec(node: TreeNode): void {
    if (node.id !== root!.id) {
      const yKeys = nodeKeysFor(yAxis.value, node, root!);
      const xKeys = nodeKeysFor(xAxis.value, node, root!);
      // Push card pour chaque combinaison Y × X présente sur le nœud
      for (const yk of yKeys) {
        for (const xk of xKeys) {
          out.get(yk)?.get(xk)?.push({ kind: 'node', node });
        }
      }
      // Améliorations : on n'a une vraie deadline que sur imp.deadline ;
      // les autres axes héritent du nœud parent.
      const imps = Array.isArray(node['improvements'])
        ? (node['improvements'] as ImprovementLike[])
        : [];
      for (const imp of imps) {
        const xKeysImp =
          xAxis.value === 'deadlines' ? (imp.deadline ? [imp.deadline] : xKeys) : xKeys;
        const yKeysImp =
          yAxis.value === 'deadlines' ? (imp.deadline ? [imp.deadline] : yKeys) : yKeys;
        for (const yk of yKeysImp) {
          for (const xk of xKeysImp) {
            out
              .get(yk)
              ?.get(xk)
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
  const rows = entriesFor(yAxis.value);
  return rows.filter((r) => {
    const cells = grid.value.get(r.key);
    if (!cells) return false;
    for (const arr of cells.values()) if (arr.some(cardMatchesSearch)) return true;
    return false;
  });
});

const visibleCols = computed(() => entriesFor(xAxis.value));

const stats = computed(() => {
  let nodes = 0;
  let imps = 0;
  const seen = new Set<string>();
  for (const colMap of grid.value.values()) {
    for (const items of colMap.values()) {
      for (const it of items) {
        if (!cardMatchesSearch(it)) continue;
        const key = `${it.kind}-${it.node.id}-${it.improvement?.id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (it.kind === 'node') nodes++;
        else imps++;
      }
    }
  }
  return { nodes, imps };
});

const countByCol = computed(() => {
  const counts: Record<string, number> = {};
  for (const x of visibleCols.value) counts[x.key] = 0;
  const seen = new Set<string>();
  for (const colMap of grid.value.values()) {
    for (const [xk, items] of colMap.entries()) {
      for (const it of items) {
        if (!cardMatchesSearch(it)) continue;
        const key = `${xk}-${it.kind}-${it.node.id}-${it.improvement?.id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        counts[xk] = (counts[xk] ?? 0) + 1;
      }
    }
  }
  return counts;
});

function colColorClass(key: string): string {
  if (xAxis.value !== 'deadlines') return '';
  if (key.includes('juin')) return 'kanban__col-header--juin-2026';
  if (key.includes('sept')) return 'kanban__col-header--septembre-2026';
  if (key.includes('dec') || key.includes('déc')) return 'kanban__col-header--decembre-2026';
  if (key.includes('2027') || key === 'y2027' || key.includes('long'))
    return 'kanban__col-header--2027';
  return '';
}

function navigateToNode(nodeId: string): void {
  void router.push({ name: 'project-tree', params: { slug: slug.value }, query: { id: nodeId } });
}

// --- Drag-and-drop : déplacer un nœud d'une colonne deadline à l'autre.
//     Le drop change `node.deadline` (axe X = deadlines requis).

const draggedNodeId = ref<string | null>(null);

function onDragStart(card: Card, e: DragEvent): void {
  if (!canEdit.value) return;
  if (card.kind !== 'node') return;
  if (xAxis.value !== 'deadlines') return;
  draggedNodeId.value = card.node.id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.node.id);
  }
}

function onDragOver(e: DragEvent): void {
  if (xAxis.value !== 'deadlines' || !draggedNodeId.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  (e.currentTarget as HTMLElement).classList.add('roadmap-cell--drop-target');
}
function onDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('roadmap-cell--drop-target');
}

async function onDrop(targetColKey: string, e: DragEvent): Promise<void> {
  (e.currentTarget as HTMLElement).classList.remove('roadmap-cell--drop-target');
  const sourceId = draggedNodeId.value;
  draggedNodeId.value = null;
  if (!sourceId || !treeStore.tree) return;
  if (xAxis.value !== 'deadlines') return;
  if (!ensureEdit()) return;
  const next = updateNode(treeStore.tree, sourceId, { deadline: targetColKey });
  if (next) {
    treeStore.setTree(next);
    await treeStore.save(`Roadmap : ${sourceId} → ${targetColKey}`);
  }
}

const DIM_LABEL: Record<Dimension, string> = {
  page_types: 'Types de page',
  audiences: 'Publics cibles',
  deadlines: 'Échéances',
};
</script>

<template>
  <div v-if="treeStore.loading">Chargement…</div>
  <div v-else-if="treeStore.error" class="alert alert-error">Erreur : {{ treeStore.error }}</div>
  <div v-else-if="treeStore.tree">
    <PageHeader
      title="Roadmap fonctionnelle"
      subtitle="Vue dérivée de l'arbre. Choisissez deux dimensions à croiser. Quand l'axe colonnes est l'échéance, glisser-déposer une carte change la date du nœud."
    />

    <div class="fr-grid-row fr-grid-row--gutters" style="margin-bottom: 1rem">
      <div class="fr-col-12 fr-col-md-6">
        <label class="fr-label" for="roadmap-search">Rechercher un nœud, une amélioration…</label>
        <input
          id="roadmap-search"
          v-model="search"
          type="search"
          placeholder="ex. leasing, carte, simulateur…"
          class="fr-input"
        />
      </div>
      <div class="fr-col-6 fr-col-md-3">
        <label class="fr-label" for="roadmap-y">Lignes</label>
        <select id="roadmap-y" v-model="yAxis" class="fr-select">
          <option value="page_types">{{ DIM_LABEL.page_types }}</option>
          <option value="audiences">{{ DIM_LABEL.audiences }}</option>
          <option value="deadlines">{{ DIM_LABEL.deadlines }}</option>
        </select>
      </div>
      <div class="fr-col-6 fr-col-md-3">
        <label class="fr-label" for="roadmap-x">Colonnes</label>
        <select id="roadmap-x" v-model="xAxis" class="fr-select">
          <option value="page_types">{{ DIM_LABEL.page_types }}</option>
          <option value="audiences">{{ DIM_LABEL.audiences }}</option>
          <option value="deadlines">{{ DIM_LABEL.deadlines }}</option>
        </select>
      </div>
    </div>

    <div class="counters">
      <span class="counter-pill"
        ><strong>{{ stats.nodes }}</strong> nœud{{ stats.nodes > 1 ? 's' : '' }}</span
      >
      <span class="counter-pill"
        ><strong>{{ stats.imps }}</strong> amélioration{{ stats.imps > 1 ? 's' : '' }}</span
      >
      <span v-for="col in visibleCols" :key="col.key" class="counter-pill">
        <strong>{{ countByCol[col.key] ?? 0 }}</strong> {{ col.label }}
      </span>
    </div>

    <p v-if="canEdit && xAxis === 'deadlines'" class="alert alert-info" style="font-size: 0.85rem">
      💡 Glisser-déposer une carte nœud vers une autre colonne pour changer son échéance.
    </p>

    <div v-if="visibleRows.length === 0" class="alert alert-info">
      Aucune ligne à afficher. Vérifiez que les nœuds ont des valeurs sur les dimensions choisies
      (depuis l'Arborescence).
    </div>
    <div
      v-else
      class="roadmap-grid"
      :style="{ gridTemplateColumns: `180px repeat(${visibleCols.length}, minmax(0, 1fr))` }"
    >
      <div></div>
      <div
        v-for="col in visibleCols"
        :key="col.key"
        class="kanban__col-header"
        :class="colColorClass(col.key)"
      >
        <span>{{ col.label }}</span>
        <span class="count-badge">{{ countByCol[col.key] ?? 0 }}</span>
      </div>
      <template v-for="row in visibleRows" :key="row.key">
        <div class="roadmap-row-header">{{ row.label }}</div>
        <div
          v-for="col in visibleCols"
          :key="col.key + '-' + row.key"
          class="roadmap-cell"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop(col.key, $event)"
        >
          <template
            v-for="card in (grid.get(row.key)?.get(col.key) ?? []).filter(cardMatchesSearch)"
            :key="card.kind + '-' + card.node.id + '-' + (card.improvement?.id ?? '')"
          >
            <div
              class="roadmap-card"
              :class="{
                'roadmap-card--imp': card.kind === 'improvement',
                'roadmap-card--draggable': canEdit && xAxis === 'deadlines' && card.kind === 'node',
              }"
              :draggable="canEdit && xAxis === 'deadlines' && card.kind === 'node'"
              @dragstart="onDragStart(card, $event)"
            >
              <div class="roadmap-card__head">
                <template v-if="card.kind === 'improvement' && card.improvement">
                  <InlineEdit
                    :value="card.improvement.title"
                    :can-edit="canEdit"
                    placeholder="(sans titre)"
                    display-class="roadmap-card__title"
                    @update="
                      (v: string) =>
                        updateImprovement(card.node.id, card.improvement!.id, 'title', v)
                    "
                    @edit-attempt="ensureEdit"
                  />
                </template>
                <template v-else>
                  <strong class="roadmap-card__title">{{ card.node.label }}</strong>
                </template>
                <button
                  class="roadmap-card__link"
                  type="button"
                  title="Ouvrir dans l'arborescence"
                  @click="navigateToNode(card.node.id)"
                >
                  ↗
                </button>
              </div>
              <template v-if="card.kind === 'improvement' && card.improvement">
                <InlineEdit
                  :value="card.improvement.description"
                  textarea
                  :rows="2"
                  :can-edit="canEdit"
                  placeholder="(description)"
                  display-class="roadmap-card__desc"
                  @update="
                    (v: string) =>
                      updateImprovement(card.node.id, card.improvement!.id, 'description', v)
                  "
                  @edit-attempt="ensureEdit"
                />
                <small style="color: #888">via {{ card.node.label }}</small>
              </template>
              <template v-else>
                <div v-if="card.node.tldr" class="roadmap-card__desc">{{ card.node.tldr }}</div>
                <code class="roadmap-card__id">{{ card.node.id }}</code>
              </template>
            </div>
          </template>
        </div>
      </template>
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

.roadmap-grid {
  display: grid;
  gap: 0.5rem;
  background: transparent;
}
.roadmap-row-header {
  background: white;
  padding: 0.6rem 0.5rem;
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-mention-grey, #555);
  display: flex;
  align-items: center;
}
.roadmap-cell {
  background: #f7f7f7;
  border: 1px solid var(--border-default-grey, #eaeaea);
  border-radius: 4px;
  padding: 0.4rem;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  transition: background 0.15s;
}
.roadmap-cell--drop-target {
  background: var(--background-contrast-info, #d1e4ff);
  outline: 2px dashed var(--text-action-high-blue-france, #000091);
  outline-offset: -2px;
}
.roadmap-card {
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.roadmap-card--imp {
  border-left: 3px solid #d49b22;
}
.roadmap-card--draggable {
  cursor: grab;
}
.roadmap-card--draggable:active {
  cursor: grabbing;
}
.roadmap-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.3rem;
}
.roadmap-card :deep(.roadmap-card__title) {
  font-weight: 600;
  flex: 1;
  color: var(--text-action-high-blue-france, #000091);
}
.roadmap-card :deep(.roadmap-card__desc) {
  font-size: 0.78rem;
  color: var(--text-mention-grey, #555);
  display: block;
}
.roadmap-card__id {
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
  color: var(--text-mention-grey, #888);
  background: #f1f1f1;
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
  align-self: flex-start;
}
.roadmap-card__link {
  background: none;
  border: none;
  font-size: 0.95rem;
  color: var(--text-action-high-blue-france, #000091);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.roadmap-card__link:hover {
  text-decoration: underline;
}
</style>
