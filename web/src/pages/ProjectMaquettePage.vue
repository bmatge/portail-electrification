<script setup lang="ts">
// Page Maquette : éditeur de paragraphs DSFR par nœud.
// - Liste à gauche les nœuds qui ont déjà une clé `maquette.paragraphs[]`
//   + tous les autres (en gris : « pas encore de maquette »).
// - Sélection d'un nœud → liste de ses paragraphs à droite, avec
//   ajout/édition/suppression via ParagraphEditor (couvre les 17 schémas).
//
// Persistance : via useTreeStore (le maquette[] vit dans node.maquette).
// Donc auth-aware + If-Match + bac à sable automatiquement.

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { PARAGRAPH_LABELS, PARAGRAPH_SCHEMAS, defaultsFor } from '@latelier/shared';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';
import { walk, updateNode } from '../composables/useTreeEditor.js';
import ParagraphEditor from '../components/maquette/ParagraphEditor.vue';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const treeStore = useTreeStore();
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

const selectedId = ref<string>('');
const codeToAdd = ref<string>('callout');

const allCodes = computed(() => Object.keys(PARAGRAPH_SCHEMAS));

onMounted(async () => {
  if (slug.value) await treeStore.hydrate(slug.value);
});

watch(slug, async (s) => {
  if (s) await treeStore.hydrate(s);
});

const canEdit = computed(() => {
  if (auth.can('tree:write')) return true;
  return sandbox.isActive(slug.value);
});

const nodes = computed<Array<{ node: TreeNode; depth: number; hasMaquette: boolean }>>(() => {
  if (!treeStore.tree) return [];
  const out: Array<{ node: TreeNode; depth: number; hasMaquette: boolean }> = [];
  for (const { node, depth } of walk(treeStore.tree)) {
    const m = node['maquette'] as MaquetteData | undefined;
    const hasMaquette = !!m && Array.isArray(m.paragraphs) && m.paragraphs.length > 0;
    out.push({ node, depth, hasMaquette });
  }
  return out;
});

const selected = computed(() => {
  if (!treeStore.tree) return null;
  for (const { node } of walk(treeStore.tree)) {
    if (node.id === selectedId.value) return node;
  }
  return null;
});

const selectedParagraphs = computed<Paragraph[]>(() => {
  const m = selected.value?.['maquette'] as MaquetteData | undefined;
  if (m && Array.isArray(m.paragraphs)) return m.paragraphs;
  return [];
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

async function updateParagraphs(paragraphs: Paragraph[]): Promise<void> {
  if (!treeStore.tree || !selected.value) return;
  const m = (selected.value['maquette'] as MaquetteData | undefined) ?? {};
  const newMaquette: MaquetteData = { ...m, paragraphs };
  const next = updateNode(treeStore.tree, selected.value.id, {
    maquette: newMaquette as Record<string, unknown>,
  });
  if (next) {
    treeStore.setTree(next);
    await treeStore.save(`maquette: ${selected.value.id}`);
  }
}

function addParagraph(): void {
  if (!ensureEditOrModal()) return;
  const code = codeToAdd.value;
  const newP: Paragraph = { id: newParagraphId(), code, data: defaultsFor(code) };
  void updateParagraphs([...selectedParagraphs.value, newP]);
}

function updateParagraphData(index: number, data: unknown): void {
  if (!ensureEditOrModal()) return;
  const next = selectedParagraphs.value.slice();
  const old = next[index];
  if (!old) return;
  next[index] = { ...old, data };
  void updateParagraphs(next);
}

function removeParagraph(index: number): void {
  if (!ensureEditOrModal()) return;
  if (!confirm('Supprimer ce paragraph ?')) return;
  const next = selectedParagraphs.value.slice();
  next.splice(index, 1);
  void updateParagraphs(next);
}

function moveParagraph(index: number, dir: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const next = selectedParagraphs.value.slice();
  const j = index + dir;
  if (j < 0 || j >= next.length) return;
  const a = next[index];
  const b = next[j];
  if (!a || !b) return;
  next[index] = b;
  next[j] = a;
  void updateParagraphs(next);
}

function onEditAttempt(): void {
  if (!canEdit.value && !auth.user) sandbox.openModal('edit');
}
</script>

<template>
  <div v-if="treeStore.loading">Chargement…</div>
  <div v-else-if="treeStore.error" class="alert alert-error">Erreur : {{ treeStore.error }}</div>
  <div v-else-if="treeStore.tree" class="maquette-layout">
    <aside class="maquette-side">
      <h3 style="margin-top: 0">Nœuds</h3>
      <ul style="list-style: none; padding: 0; margin: 0">
        <li
          v-for="item in nodes"
          :key="item.node.id"
          :style="{ paddingLeft: `${item.depth * 0.75}rem` }"
        >
          <button
            type="button"
            class="node-link"
            :class="{
              selected: item.node.id === selectedId,
              dim: !item.hasMaquette,
            }"
            @click="selectedId = item.node.id"
          >
            {{ item.node.label }}
            <span v-if="item.hasMaquette" class="badge" style="float: right">
              {{ ((item.node['maquette'] as MaquetteData | undefined)?.paragraphs ?? []).length }}
            </span>
          </button>
        </li>
      </ul>
    </aside>
    <div class="maquette-main">
      <div v-if="!selected" style="color: #888">Sélectionnez un nœud pour éditer sa maquette.</div>
      <div v-else>
        <h3 style="margin-top: 0">{{ selected.label }}</h3>
        <p style="color: #555; font-size: 0.9rem">
          id : <code>{{ selected.id }}</code>
        </p>

        <ParagraphEditor
          v-for="(p, i) in selectedParagraphs"
          :key="p.id"
          :code="p.code"
          :data="p.data"
          :can-edit="canEdit"
          @update="(data) => updateParagraphData(i, data)"
          @edit-attempt="onEditAttempt"
        >
          <template #header-actions>
            <button class="btn-outline btn" type="button" @click="moveParagraph(i, -1)">↑</button>
            <button class="btn-outline btn" type="button" @click="moveParagraph(i, 1)">↓</button>
            <button class="btn" type="button" @click="removeParagraph(i)">Suppr.</button>
          </template>
        </ParagraphEditor>

        <div class="toolbar" style="margin-top: 1rem">
          <select v-model="codeToAdd" class="input">
            <option v-for="c in allCodes" :key="c" :value="c">
              {{ PARAGRAPH_LABELS[c] ?? c }}
            </option>
          </select>
          <button class="btn" type="button" @click="addParagraph">+ Ajouter un paragraph</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.maquette-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1rem;
}
@media (max-width: 900px) {
  .maquette-layout {
    grid-template-columns: 1fr;
  }
}
.maquette-side {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.75rem;
  max-height: calc(100vh - 12rem);
  overflow: auto;
  position: sticky;
  top: 1rem;
}
.node-link {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0.3rem 0.4rem;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
.node-link.dim {
  color: #999;
}
.node-link:hover {
  background: #f3f3f3;
}
.node-link.selected {
  background: #e3e9ff;
  color: #000091;
  font-weight: 500;
}
</style>
