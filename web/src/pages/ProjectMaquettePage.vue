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
import { walk, find, updateNode } from '../composables/useTreeEditor.js';
import ParagraphLive from '../components/maquette/ParagraphLive.vue';
import MaquetteProperties from '../components/maquette/MaquetteProperties.vue';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const treeStore = useTreeStore();
const vocabStore = useVocabStore();
const mesuresStore = useMesuresStore();
const drupalStore = useDrupalStructureStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();

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
  // Onglet par défaut : root
  if (!activeRootChildId.value) {
    activeRootChildId.value = treeStore.tree.id;
  }
  // Sélection : root par défaut
  if (!selectedNodeId.value) {
    selectedNodeId.value = treeStore.tree.id;
  }
}

const canEdit = computed(() => {
  if (auth.can('tree:write')) return true;
  return sandbox.isActive(slug.value);
});

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

// Types Drupal : extraits de drupal_structure.types s'il existe, sinon
// liste hardcodée. Le legacy avait une liste fixe : Accueil, Hub thématique,
// Article, Service, Simulateur, Page transverse...
const drupalTypes = computed(() => {
  const d = drupalStore.data as { types?: Array<{ key?: string; label?: string }> } | null;
  if (Array.isArray(d?.types) && d.types.length) {
    return d.types.map((t, i) => ({
      key: String(t.key ?? `type-${i}`),
      label: String(t.label ?? t.key ?? `Type ${i + 1}`),
    }));
  }
  return [
    { key: 'accueil', label: 'Accueil' },
    { key: 'hub', label: 'Hub thématique' },
    { key: 'article', label: 'Article' },
    { key: 'service', label: 'Service' },
    { key: 'simulator', label: 'Simulateur' },
    { key: 'page', label: 'Page transverse' },
  ];
});

const editorialTypes = computed(() => {
  const d = drupalStore.data as {
    editorial_types?: Array<{ key?: string; label?: string }>;
  } | null;
  if (Array.isArray(d?.editorial_types) && d.editorial_types.length) {
    return d.editorial_types.map((t, i) => ({
      key: String(t.key ?? `ed-${i}`),
      label: String(t.label ?? t.key ?? `Éditorial ${i + 1}`),
    }));
  }
  return [
    { key: 'guide', label: 'Guide pratique' },
    { key: 'actualite', label: 'Actualité' },
    { key: 'temoignage', label: 'Témoignage' },
    { key: 'fiche', label: "Fiche d'aide" },
  ];
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
  if (!confirm('Supprimer ce paragraph ?')) return;
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
      if (
        !confirm(
          `${conflicts.length} nœud(s) ont déjà une maquette : ${conflicts.slice(0, 5).join(', ')}${conflicts.length > 5 ? '…' : ''}. Écraser ?`,
        )
      )
        return;
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
  <div v-else-if="treeStore.tree">
    <h2 style="margin: 0 0 0.25rem; font-size: 1.2rem">Maquette interactive</h2>
    <p style="margin: 0 0 1rem; color: #555; font-size: 0.9rem">
      Prévisualisation page par page du futur hub. À droite, les propriétés Drupal (type de contenu,
      paragraphes, taxonomies) sont éditables et persistées.
    </p>

    <!-- Onglets sous-arbres niveau 1 -->
    <nav class="tabs maquette-tabs">
      <button
        v-for="r in rootChildren"
        :key="r.id"
        type="button"
        :class="{ 'router-link-active': r.id === activeRootChildId }"
        @click="activateRootChild(r.id)"
      >
        {{ r.id === treeStore.tree.id ? 'Accueil' : r.label }}
      </button>
    </nav>

    <!-- Toolbar breadcrumb + import/export -->
    <div class="toolbar" style="margin-bottom: 0.75rem">
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

    <div class="maquette-layout">
      <!-- Sidebar : liste des nœuds du sous-arbre actif -->
      <aside class="maquette-side">
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
        </div>
      </div>

      <!-- Panneau Propriétés -->
      <MaquetteProperties
        v-if="selected"
        :maquette="selectedMaquette as Record<string, unknown>"
        :vocab="vocab"
        :mesures-catalog="mesuresCatalog"
        :drupal-types="drupalTypes"
        :editorial-types="editorialTypes"
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
@media (max-width: 1100px) {
  .maquette-layout {
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
