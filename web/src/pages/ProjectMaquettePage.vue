<script setup lang="ts">
// Page Maquette v2 — refonte complète pour rattraper la v1 vanilla.
//
// Layout :
//   - Toolbar haute : breadcrumb nœud sélectionné + boutons Import / Export.
//   - Navigation par sous-arbres niveau 1 (enfants directs du root) en
//     onglets, comme la v1 (Accueil / Particuliers / Pros / Partenaires…).
//   - Liste plate des nœuds du sous-arbre actif à gauche.
//   - Preview éditable interactive au centre (ParagraphLive).
//   - Panneau Propriétés Drupal à droite (MaquetteProperties).
//
// La maquette d'un nœud vit dans `node.maquette` (tree) :
//   { paragraphs: [{ id, code, data }], taxonomy: { drupal_type, editorial_type, cibles, mesures } }

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  LEGACY_VOCAB,
  PARAGRAPH_LABELS,
  PARAGRAPH_SCHEMAS,
  defaultsFor,
  type VocabConfig,
} from '@latelier/shared';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useVocabStore, useMesuresStore, useDrupalStructureStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { useConfirm } from '../stores/confirm.js';
import { useCanEdit } from '../composables/useCanEdit.js';
import { walk, find, updateNode } from '../composables/useTreeEditor.js';
import ParagraphLive from '../components/maquette/ParagraphLive.vue';
import MaquetteProperties from '../components/maquette/MaquetteProperties.vue';
import NodeImprovements from '../components/tree/NodeImprovements.vue';
import PageHeader from '../components/ui/PageHeader.vue';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const treeStore = useTreeStore();
const vocabStore = useVocabStore();
const mesuresStore = useMesuresStore();
const drupalStore = useDrupalStructureStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();
const confirmStore = useConfirm();

interface Paragraph {
  id: string;
  code: string;
  data: unknown;
}
interface MaquetteData {
  paragraphs?: Paragraph[];
  taxonomy?: Record<string, unknown>;
  [k: string]: unknown;
}

const activeRootChildId = ref<string | null>(null);
const selectedNodeId = ref<string>('');
const codeToAdd = ref<string>('callout');
const fileInput = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  if (slug.value) {
    await Promise.all([
      treeStore.hydrate(slug.value),
      vocabStore.hydrate(slug.value),
      mesuresStore.hydrate(slug.value),
      drupalStore.hydrate(slug.value),
    ]);
    initSelection();
  }
});

watch(slug, async (s) => {
  if (s) {
    await Promise.all([
      treeStore.hydrate(s),
      vocabStore.hydrate(s),
      mesuresStore.hydrate(s),
      drupalStore.hydrate(s),
    ]);
    initSelection();
  }
});

function initSelection(): void {
  if (!treeStore.tree) return;
  // Si la route contient ?node=X, on positionne directement sur ce nœud
  // (utilisé par le lien « Éditer la maquette » depuis l'Arborescence).
  const queryNode = route.query['node'] as string | undefined;
  if (queryNode && treeStore.tree) {
    const found = find(treeStore.tree, queryNode);
    if (found) {
      selectedNodeId.value = queryNode;
      // Remonte au sous-arbre racine (enfant direct du root) qui contient
      // ce nœud pour activer le bon onglet.
      const rootChildId = ((): string => {
        const path = pathFrom(treeStore.tree, queryNode);
        return path[1]?.id ?? treeStore.tree.id;
      })();
      activeRootChildId.value = rootChildId;
      return;
    }
  }
  if (!activeRootChildId.value) {
    activeRootChildId.value = treeStore.tree.id;
  }
  if (!selectedNodeId.value) {
    selectedNodeId.value = treeStore.tree.id;
  }
}

// Reconstruit le chemin root → … → target (utilisé pour activer le bon onglet
// quand on arrive via ?node=…).
function pathFrom(tree: TreeNode, targetId: string): TreeNode[] {
  const out: TreeNode[] = [];
  function rec(n: TreeNode, acc: TreeNode[]): boolean {
    const next = [...acc, n];
    if (n.id === targetId) {
      out.push(...next);
      return true;
    }
    for (const c of n.children ?? []) if (rec(c, next)) return true;
    return false;
  }
  rec(tree, []);
  return out;
}

const canEdit = useCanEdit('tree:write', () => slug.value);

const vocab = computed<VocabConfig>(() => {
  const d = vocabStore.data as VocabConfig | null;
  if (d && Array.isArray(d.audiences)) return d;
  return LEGACY_VOCAB;
});

const mesuresCatalog = computed(() => {
  const d = mesuresStore.data as { mesures?: Array<{ id?: string; label?: string }> } | null;
  return (d?.mesures ?? []).map((m, i) => ({
    id: String(m.id ?? `M${i + 1}`),
    label: String(m.label ?? ''),
  }));
});

// Structure CMS du projet (types de contenu + taxonomies). Lue depuis
// la clé `drupal_structure` du store ; alimentée par l'utilisateur via
// Modèle de données → Structure CMS. Fallback vide si rien n'est défini
// (le composant Properties affichera un lien vers la page d'édition).
interface RawCmsStructure {
  content_types?: unknown;
  taxonomies?: unknown;
  paragraphs?: unknown;
}
interface CmsTaxonomy {
  key: string;
  label: string;
  multi?: boolean;
  options: string[];
}
const cmsStructure = computed<{
  content_types: string[];
  taxonomies: CmsTaxonomy[];
}>(() => {
  const raw = (drupalStore.data ?? {}) as RawCmsStructure;
  const content_types = Array.isArray(raw.content_types)
    ? raw.content_types.filter((x): x is string => typeof x === 'string')
    : [];
  const taxonomies = Array.isArray(raw.taxonomies)
    ? (raw.taxonomies as Array<Record<string, unknown>>)
        .filter((t) => typeof t['key'] === 'string')
        .map((t) => ({
          key: String(t['key']),
          label: String(t['label'] ?? t['key']),
          multi: t['multi'] === true,
          options: Array.isArray(t['options'])
            ? (t['options'] as unknown[]).filter((x): x is string => typeof x === 'string')
            : [],
        }))
    : [];
  return { content_types, taxonomies };
});

// --- Navigation sous-arbres ---------------------------------------------
const rootChildren = computed<TreeNode[]>(() => {
  const root = treeStore.tree;
  if (!root) return [];
  // Les enfants directs du root deviennent les onglets de page niveau 1
  // (Accueil = root, Particuliers, Pros, Partenaires...).
  return [root, ...(root.children ?? [])];
});

function activeSubtreeRoot(): TreeNode | null {
  if (!treeStore.tree || !activeRootChildId.value) return null;
  if (activeRootChildId.value === treeStore.tree.id) return treeStore.tree;
  return find(treeStore.tree, activeRootChildId.value)?.node ?? null;
}

const subtreeNodes = computed<Array<{ node: TreeNode; depth: number; hasMaquette: boolean }>>(
  () => {
    const root = activeSubtreeRoot();
    if (!root) return [];
    const out: Array<{ node: TreeNode; depth: number; hasMaquette: boolean }> = [];
    // walk inclut le root du sous-arbre comme depth=0
    for (const { node, depth } of walk(root)) {
      const m = node['maquette'] as MaquetteData | undefined;
      const hasMaquette = !!m && Array.isArray(m.paragraphs) && m.paragraphs.length > 0;
      out.push({ node, depth, hasMaquette });
    }
    return out;
  },
);

function activateRootChild(id: string): void {
  activeRootChildId.value = id;
  selectedNodeId.value = id;
}

// --- Nœud sélectionné ----------------------------------------------------
const selected = computed<TreeNode | null>(() => {
  if (!treeStore.tree) return null;
  return find(treeStore.tree, selectedNodeId.value)?.node ?? null;
});

const selectedMaquette = computed<MaquetteData>(() => {
  return (selected.value?.['maquette'] as MaquetteData | undefined) ?? {};
});

const paragraphs = computed<Paragraph[]>(() => {
  const p = selectedMaquette.value.paragraphs;
  return Array.isArray(p) ? p : [];
});

function ensureEditOrModal(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer ce projet.");
  return false;
}

function newParagraphId(): string {
  return 'p' + Math.random().toString(36).slice(2, 8);
}

async function updateNodeMaquette(patch: Partial<MaquetteData>): Promise<void> {
  if (!treeStore.tree || !selected.value) return;
  const m = (selected.value['maquette'] as MaquetteData | undefined) ?? {};
  const newMaquette: MaquetteData = { ...m, ...patch };
  const next = updateNode(treeStore.tree, selected.value.id, {
    maquette: newMaquette as Record<string, unknown>,
  });
  if (next) {
    treeStore.setTree(next);
    await treeStore.save(`maquette ${selected.value.id}`);
  }
}

function addParagraph(): void {
  if (!ensureEditOrModal()) return;
  const newP: Paragraph = {
    id: newParagraphId(),
    code: codeToAdd.value,
    data: defaultsFor(codeToAdd.value),
  };
  void updateNodeMaquette({ paragraphs: [...paragraphs.value, newP] });
}

function updateParagraph(index: number, data: unknown): void {
  if (!ensureEditOrModal()) return;
  const arr = paragraphs.value.slice();
  const old = arr[index];
  if (!old) return;
  arr[index] = { ...old, data };
  void updateNodeMaquette({ paragraphs: arr });
}

function removeParagraph(index: number): void {
  if (!ensureEditOrModal()) return;
  const arr = paragraphs.value.slice();
  arr.splice(index, 1);
  void updateNodeMaquette({ paragraphs: arr });
}

function moveParagraph(index: number, dir: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const arr = paragraphs.value.slice();
  const j = index + dir;
  if (j < 0 || j >= arr.length) return;
  const a = arr[index];
  const b = arr[j];
  if (!a || !b) return;
  arr[index] = b;
  arr[j] = a;
  void updateNodeMaquette({ paragraphs: arr });
}

function updateTaxonomy(patch: Record<string, unknown>): void {
  if (!ensureEditOrModal()) return;
  void updateNodeMaquette({ taxonomy: patch });
}

// Mutation arbitraire sur le nœud sélectionné (utilisé par NodeImprovements
// pour mettre à jour `node.improvements[]`). Émet une révision tree avec
// le même mécanisme que la page Arborescence.
async function patchSelectedNode(nodePatch: Partial<TreeNode>): Promise<void> {
  if (!ensureEditOrModal()) return;
  if (!treeStore.tree || !selected.value) return;
  const next = updateNode(treeStore.tree, selected.value.id, nodePatch);
  if (next) {
    treeStore.setTree(next);
    await treeStore.save(`Édition nœud ${selected.value.id}`);
  }
}

function onEditAttempt(): void {
  if (!canEdit.value && !auth.user) sandbox.openModal('edit');
}

// --- Import / Export -----------------------------------------------------
function exportMaquette(): void {
  if (!treeStore.tree) return;
  const out: Record<string, MaquetteData> = {};
  for (const { node } of walk(treeStore.tree)) {
    const m = node['maquette'] as MaquetteData | undefined;
    if (m && (Array.isArray(m.paragraphs) || m.taxonomy)) {
      out[node.id] = m;
    }
  }
  const payload = {
    version: 1 as const,
    exported_at: new Date().toISOString(),
    slug: slug.value,
    maquettes: out,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maquette-${slug.value}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerImport(): void {
  if (!ensureEditOrModal()) return;
  fileInput.value?.click();
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !treeStore.tree) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as { maquettes?: Record<string, MaquetteData> };
    if (!parsed.maquettes || typeof parsed.maquettes !== 'object') {
      alert('Format invalide : clé `maquettes` manquante.');
      return;
    }
    const conflicts: string[] = [];
    for (const id of Object.keys(parsed.maquettes)) {
      const existing = find(treeStore.tree, id);
      if (existing && Array.isArray((existing.node['maquette'] as MaquetteData)?.paragraphs)) {
        conflicts.push(id);
      }
    }
    if (conflicts.length > 0) {
      const ok = await confirmStore.ask({
        title: `Écraser ${conflicts.length} maquette(s) existante(s) ?`,
        message: `Les nœuds suivants ont déjà une maquette qui sera remplacée : ${conflicts.slice(0, 5).join(', ')}${conflicts.length > 5 ? '…' : ''}.`,
        confirmLabel: 'Écraser',
        danger: true,
      });
      if (!ok) return;
    }
    // Applique nœud par nœud (commits successifs côté store).
    let nextTree = JSON.parse(JSON.stringify(treeStore.tree)) as TreeNode;
    let applied = 0;
    for (const [id, m] of Object.entries(parsed.maquettes)) {
      const found = find(nextTree, id);
      if (!found) continue;
      const updated = updateNode(nextTree, id, { maquette: m as Record<string, unknown> });
      if (updated) {
        nextTree = updated;
        applied++;
      }
    }
    treeStore.setTree(nextTree);
    await treeStore.save(`Import maquette (${applied} nœuds)`);
    alert(`✓ ${applied} maquette(s) importée(s).`);
  } catch (err) {
    alert(`Erreur d'import : ${(err as Error).message}`);
  }
}

const allCodes = computed(() => Object.keys(PARAGRAPH_SCHEMAS));

// Enfants directs du nœud sélectionné — alimentent la carte "sous-pages"
const selectedChildren = computed<TreeNode[]>(() => selected.value?.children ?? []);

// Sous-nav hiérarchique : un dropdown par onglet quand il a des enfants
const openMenuId = ref<string | null>(null);
function toggleMenu(id: string): void {
  openMenuId.value = openMenuId.value === id ? null : id;
}
function closeMenus(): void {
  openMenuId.value = null;
}

// Panneaux gauche/droit repliables pour passer la preview en plein écran
const showSidebar = ref(true);
const showProperties = ref(true);

const breadcrumb = computed<TreeNode[]>(() => {
  if (!treeStore.tree || !selected.value) return [];
  // Reconstruit le chemin root → … → selected
  const path: TreeNode[] = [];
  function rec(n: TreeNode, target: string, acc: TreeNode[]): boolean {
    const next = [...acc, n];
    if (n.id === target) {
      path.push(...next);
      return true;
    }
    for (const c of n.children ?? []) {
      if (rec(c, target, next)) return true;
    }
    return false;
  }
  rec(treeStore.tree, selected.value.id, []);
  return path;
});
</script>

<template>
  <div v-if="treeStore.loading">Chargement…</div>
  <div v-else-if="treeStore.error" class="alert alert-error">Erreur : {{ treeStore.error }}</div>
  <div v-else-if="treeStore.tree" @click="closeMenus">
    <PageHeader
      title="Maquette interactive"
      subtitle="Prévisualisation page par page du futur hub. Cliquez sur les éléments du rendu pour les éditer directement ; le panneau Propriétés à droite est persistant."
    />

    <!-- Sous-navigation hiérarchique : onglets niveau 1 + dropdown des
         enfants pour chaque rubrique qui en a. Mimique la nav v1. -->
    <nav class="subnav maquette-subnav" @click.stop>
      <div v-for="r in rootChildren" :key="r.id" class="subnav__item">
        <button
          type="button"
          class="subnav__btn"
          :class="{ 'is-active': r.id === activeRootChildId }"
          @click="activateRootChild(r.id)"
        >
          {{ r.id === treeStore.tree.id ? 'Accueil' : r.label }}
          <span
            v-if="(r.children ?? []).length"
            class="subnav__caret"
            @click.stop="toggleMenu(r.id)"
            >▾</span
          >
        </button>
        <div v-if="openMenuId === r.id && (r.children ?? []).length" class="subnav__dropdown">
          <a
            v-for="c in r.children ?? []"
            :key="c.id"
            href="#"
            @click.prevent="
              () => {
                activateRootChild(r.id);
                selectedNodeId = c.id;
                closeMenus();
              }
            "
          >
            {{ c.label }}
            <small v-if="(c.children ?? []).length" style="color: #888; margin-left: 0.4rem">
              ({{ (c.children ?? []).length }})
            </small>
          </a>
        </div>
      </div>
    </nav>

    <!-- Toolbar breadcrumb + import/export + toggles panneaux -->
    <div class="toolbar" style="margin-bottom: 0.75rem">
      <button
        type="button"
        class="fr-btn fr-btn--sm fr-btn--tertiary"
        :title="showSidebar ? 'Masquer la liste des nœuds' : 'Afficher la liste des nœuds'"
        :aria-pressed="showSidebar"
        @click="showSidebar = !showSidebar"
      >
        {{ showSidebar ? '◧ Masquer liste' : '▣ Afficher liste' }}
      </button>
      <button
        type="button"
        class="fr-btn fr-btn--sm fr-btn--tertiary"
        :title="showProperties ? 'Masquer les propriétés' : 'Afficher les propriétés'"
        :aria-pressed="showProperties"
        @click="showProperties = !showProperties"
      >
        {{ showProperties ? '◨ Masquer propriétés' : '▣ Afficher propriétés' }}
      </button>
      <div class="breadcrumb">
        <template v-for="(n, i) in breadcrumb" :key="n.id">
          <span v-if="i > 0" class="breadcrumb__sep">›</span>
          <button
            type="button"
            class="breadcrumb__link"
            :class="{ 'breadcrumb__link--active': n.id === selectedNodeId }"
            @click="selectedNodeId = n.id"
          >
            {{ n.id === treeStore.tree.id ? 'Accueil' : n.label }}
          </button>
        </template>
      </div>
      <span class="spacer"></span>
      <button class="fr-btn fr-btn--secondary fr-btn--sm" type="button" @click="triggerImport">
        ⬆ Importer une maquette
      </button>
      <button class="fr-btn fr-btn--secondary fr-btn--sm" type="button" @click="exportMaquette">
        ⬇ Exporter toute la maquette
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json"
        style="display: none"
        @change="onImportFile"
      />
    </div>

    <div
      class="maquette-layout"
      :class="{
        'maquette-layout--no-side': !showSidebar,
        'maquette-layout--no-props': !showProperties,
        'maquette-layout--full': !showSidebar && !showProperties,
      }"
    >
      <!-- Sidebar : liste des nœuds du sous-arbre actif -->
      <aside v-if="showSidebar" class="maquette-side">
        <h3 style="margin-top: 0; font-size: 1rem">Nœuds</h3>
        <ul class="node-list">
          <li
            v-for="item in subtreeNodes"
            :key="item.node.id"
            :style="{ paddingLeft: `${item.depth * 0.75}rem` }"
          >
            <button
              type="button"
              class="node-link"
              :class="{
                'node-link--selected': item.node.id === selectedNodeId,
                'node-link--empty': !item.hasMaquette,
              }"
              @click="selectedNodeId = item.node.id"
            >
              {{ item.node.label }}
              <span
                v-if="item.hasMaquette"
                class="count-badge"
                style="float: right; transform: scale(0.85)"
              >
                {{ ((item.node['maquette'] as MaquetteData | undefined)?.paragraphs ?? []).length }}
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Preview interactive -->
      <div class="maquette-main">
        <div v-if="!selected">
          <p style="color: #888">Sélectionnez un nœud à gauche.</p>
        </div>
        <div v-else>
          <div class="maquette-main__head">
            <h3 style="margin: 0; flex: 1">{{ selected.label }}</h3>
            <RouterLink
              v-if="canEdit"
              :to="{ name: 'project-tree', params: { slug }, query: { id: selected.id } }"
              class="fr-btn fr-btn--tertiary fr-btn--sm"
            >
              ↗ éditer le nœud
            </RouterLink>
          </div>
          <small style="color: #666"
            >id : <code>{{ selected.id }}</code></small
          >

          <div
            v-if="paragraphs.length === 0"
            style="margin: 1.5rem 0; color: #888; font-style: italic"
          >
            Aucun paragraph pour l'instant. Ajoutez-en un ci-dessous pour commencer la maquette de
            cette page.
          </div>

          <div class="paragraphs">
            <ParagraphLive
              v-for="(p, i) in paragraphs"
              :key="p.id"
              :code="p.code"
              :data="p.data"
              :can-edit="canEdit"
              @update="(data) => updateParagraph(i, data)"
              @remove="removeParagraph(i)"
              @move="(dir) => moveParagraph(i, dir)"
              @edit-attempt="onEditAttempt"
            />
          </div>

          <div class="add-paragraph-bar">
            <select v-model="codeToAdd" class="fr-select">
              <option v-for="c in allCodes" :key="c" :value="c">
                {{ PARAGRAPH_LABELS[c] ?? c }}
              </option>
            </select>
            <button class="fr-btn fr-btn--sm" type="button" @click="addParagraph">
              + Ajouter un paragraph
            </button>
          </div>

          <!-- Section Améliorations — mutualisée avec le panneau Arborescence -->
          <section class="panel-card" style="margin-top: 2rem">
            <h3 class="panel-card__title">
              Améliorations
              <small style="color: #888; font-weight: 400; font-size: 0.85rem">
                (alimentent la roadmap)
              </small>
            </h3>
            <NodeImprovements
              :node="selected"
              :vocab="vocab"
              :can-edit="canEdit"
              @patch="patchSelectedNode"
              @edit-attempt="onEditAttempt"
            />
          </section>

          <!-- Carte « N sous-pages dans cette rubrique » avec mini-cards typées -->
          <section v-if="selectedChildren.length" class="panel-card" style="margin-top: 2rem">
            <h3 class="panel-card__title">
              {{ selectedChildren.length }} sous-page{{ selectedChildren.length > 1 ? 's' : '' }}
              dans cette rubrique
            </h3>
            <div class="sub-cards">
              <button
                v-for="c in selectedChildren"
                :key="c.id"
                type="button"
                class="sub-card"
                @click="selectedNodeId = c.id"
              >
                <span v-if="c.page_type" class="type-pill" :class="`type-${c.page_type}`">
                  {{ vocab.page_types.find((t) => t.key === c.page_type)?.label ?? c.page_type }}
                </span>
                <span class="sub-card__title">{{ c.label }}</span>
                <small v-if="(c.children ?? []).length" style="color: #666">
                  ↳ {{ (c.children ?? []).length }} sous-page{{
                    (c.children ?? []).length > 1 ? 's' : ''
                  }}
                </small>
              </button>
            </div>
          </section>
        </div>
      </div>

      <!-- Panneau Propriétés -->
      <MaquetteProperties
        v-if="selected && showProperties"
        :maquette="selectedMaquette as Record<string, unknown>"
        :vocab="vocab"
        :mesures-catalog="mesuresCatalog"
        :cms-structure="cmsStructure"
        :can-edit="canEdit"
        @update-taxonomy="updateTaxonomy"
        @edit-attempt="onEditAttempt"
      />
    </div>
  </div>
</template>

<style scoped>
.maquette-tabs {
  margin-bottom: 0.75rem;
}
.maquette-tabs button {
  padding: 0.4rem 0.9rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font: inherit;
  color: #555;
}
.maquette-tabs button:hover {
  color: #161616;
}
.maquette-tabs button.router-link-active {
  color: #000091;
  border-bottom-color: currentColor;
  font-weight: 500;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.9rem;
}
.breadcrumb__sep {
  color: #888;
}
.breadcrumb__link {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font: inherit;
}
.breadcrumb__link:hover {
  background: #f3f3ff;
}
.breadcrumb__link--active {
  color: #000091;
  font-weight: 600;
}

.maquette-layout {
  display: grid;
  grid-template-columns: 220px 1fr 280px;
  gap: 1rem;
}
.maquette-layout--no-side {
  grid-template-columns: 1fr 280px;
}
.maquette-layout--no-props {
  grid-template-columns: 220px 1fr;
}
.maquette-layout--full {
  grid-template-columns: 1fr;
}
@media (max-width: 1100px) {
  .maquette-layout,
  .maquette-layout--no-side,
  .maquette-layout--no-props {
    grid-template-columns: 1fr;
  }
}
.maquette-side {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.75rem;
  max-height: calc(100vh - 12rem);
  overflow-y: auto;
}
.node-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.node-link {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0.3rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
  font: inherit;
  font-size: 0.9rem;
}
.node-link:hover {
  background: #f3f3ff;
}
.node-link--selected {
  background: #e3e3fd;
  color: #000091;
  font-weight: 500;
}
.node-link--empty {
  color: #aaa;
}

.maquette-main__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}
.paragraphs {
  margin: 1rem 0;
}
.add-paragraph-bar {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #fafafa;
  border: 1px dashed #ccc;
  border-radius: 4px;
  margin-top: 1rem;
}
.spacer {
  flex: 1;
}
</style>
