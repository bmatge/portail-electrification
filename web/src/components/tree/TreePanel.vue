<script setup lang="ts">
// Panneau détail d'un nœud — porté complètement depuis le legacy
// assets/script.js (renderPanel + renderBlocksSection + renderMesuresSection
// + renderDispositifsSection + renderObjectivesSection + renderImprovementsSection
// + renderMaquetteSection + renderCommentsSection).
//
// Ergonomie : édition inline cliquable (InlineEdit), accordéons stateful
// (state survit aux re-renders), boutons DSFR fr-btn + fr-icon-*.

import { computed, ref } from 'vue';
import type { TreeNode } from '../../stores/tree.js';
import type { VocabConfig } from '@latelier/shared';
import InlineEdit from '../ui/InlineEdit.vue';
import NodeComments from './NodeComments.vue';

const props = defineProps<{
  node: TreeNode | null;
  root: TreeNode | null;
  isRoot: boolean;
  vocab: VocabConfig;
  canEdit: boolean;
  /** Slug projet courant, pour les requêtes commentaires/historique. */
  slug: string;
  /** Tous les dispositifs disponibles pour ce projet (catalogue). */
  dispositifsCatalog: ReadonlyArray<{ id: string; name: string }>;
  /** Toutes les mesures (politiques publiques) disponibles. */
  mesuresCatalog: ReadonlyArray<{ id: string; label: string }>;
  /** Liste flat des moyens dans la pyramide objectifs (pour afficher les liens). */
  meansForNode: ReadonlyArray<{ axeName: string; objectiveName: string; meanText: string }>;
}>();

const emit = defineEmits<{
  (e: 'patch', payload: { id: string; patch: Partial<TreeNode> }): void;
  (e: 'add-child'): void;
  (e: 'delete-node'): void;
  (e: 'move-sibling', direction: -1 | 1): void;
  (e: 'promote'): void;
  (e: 'demote'): void;
  (e: 'edit-attempt'): void;
}>();

function patch(p: Partial<TreeNode>): void {
  if (!props.node) return;
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  emit('patch', { id: props.node.id, patch: p });
}

// --- Sections ouvertes (stateful) -----------------------------------------
const openSections = ref<Set<string>>(new Set(['config']));
function onToggle(id: string, e: Event): void {
  const next = new Set(openSections.value);
  if ((e.target as HTMLDetailsElement).open) next.add(id);
  else next.delete(id);
  openSections.value = next;
}
function isOpen(id: string): boolean {
  return openSections.value.has(id);
}

// --- Multi-select audiences / types --------------------------------------
const nodeAudiences = computed(() => new Set(props.node?.audiences ?? []));
const nodeTypes = computed(() => new Set(props.node?.types ?? []));

function toggleAudience(key: string, checked: boolean): void {
  const cur = new Set(props.node?.audiences ?? []);
  if (checked) cur.add(key);
  else cur.delete(key);
  patch({ audiences: Array.from(cur) });
}
function togglePageType(key: string, checked: boolean): void {
  const cur = new Set(props.node?.types ?? []);
  if (checked) cur.add(key);
  else cur.delete(key);
  patch({ types: Array.from(cur) });
}
function toggleMesure(id: string, checked: boolean): void {
  const cur = new Set(props.node?.mesures ?? []);
  if (checked) cur.add(id);
  else cur.delete(id);
  patch({ mesures: Array.from(cur) });
}
function toggleDispositif(id: string, checked: boolean): void {
  const cur = new Set(props.node?.dispositifs ?? []);
  if (checked) cur.add(id);
  else cur.delete(id);
  patch({ dispositifs: Array.from(cur) });
}

// --- Blocks ---------------------------------------------------------------
interface Block {
  id: string;
  title: string;
  description: string;
}
const blocks = computed<Block[]>(() => {
  const b = props.node?.blocks;
  return Array.isArray(b) ? (b as Block[]) : [];
});
function newBlockId(): string {
  return 'b' + Math.random().toString(36).slice(2, 8);
}
function addBlock(): void {
  if (!props.node) return;
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  const next = [...blocks.value, { id: newBlockId(), title: '', description: '' }];
  patch({ blocks: next });
}
function updateBlock(idx: number, field: 'title' | 'description', value: string): void {
  const next = blocks.value.slice();
  const b = next[idx];
  if (!b) return;
  next[idx] = { ...b, [field]: value };
  patch({ blocks: next });
}
function removeBlock(idx: number): void {
  if (!confirm('Supprimer ce bloc ?')) return;
  const next = blocks.value.slice();
  next.splice(idx, 1);
  patch({ blocks: next });
}
function moveBlock(idx: number, dir: -1 | 1): void {
  const next = blocks.value.slice();
  const j = idx + dir;
  if (j < 0 || j >= next.length) return;
  const a = next[idx];
  const b = next[j];
  if (!a || !b) return;
  next[idx] = b;
  next[j] = a;
  patch({ blocks: next });
}

// --- Improvements (alimentent la roadmap) --------------------------------
interface Improvement {
  id: string;
  title: string;
  description: string;
  deadline: string;
}
const improvements = computed<Improvement[]>(() => {
  const v = props.node?.['improvements'];
  return Array.isArray(v) ? (v as Improvement[]) : [];
});
function newImprovementId(): string {
  return 'i' + Math.random().toString(36).slice(2, 8);
}
function addImprovement(): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  const next = [
    ...improvements.value,
    { id: newImprovementId(), title: '', description: '', deadline: '' },
  ];
  patch({ improvements: next } as Partial<TreeNode>);
}
function updateImprovement(
  idx: number,
  field: 'title' | 'description' | 'deadline',
  value: string,
): void {
  const next = improvements.value.slice();
  const it = next[idx];
  if (!it) return;
  next[idx] = { ...it, [field]: value };
  patch({ improvements: next } as Partial<TreeNode>);
}
function removeImprovement(idx: number): void {
  if (!confirm('Supprimer cette amélioration ?')) return;
  const next = improvements.value.slice();
  next.splice(idx, 1);
  patch({ improvements: next } as Partial<TreeNode>);
}

// --- Maquette aperçu ------------------------------------------------------
const maquetteParagraphCount = computed(() => {
  const m = props.node?.['maquette'] as { paragraphs?: unknown[] } | undefined;
  return Array.isArray(m?.paragraphs) ? m.paragraphs.length : 0;
});

// --- Charges --------------------------------------------------------------
function onTimeTech(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  patch({ time_tech: v === '' ? null : Number(v) });
}
function onTimeEdito(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  patch({ time_edito: v === '' ? null : Number(v) });
}
</script>

<template>
  <aside class="tree-panel l-card" v-if="node">
    <!-- Identité : libellé éditable inline + id readonly -->
    <div class="tree-panel__title">
      <InlineEdit
        :value="node.label"
        :can-edit="canEdit"
        placeholder="(sans libellé)"
        display-class="tree-panel__label"
        aria-label="Libellé du nœud"
        @update="(v) => patch({ label: v })"
        @edit-attempt="emit('edit-attempt')"
      />
    </div>
    <p class="tree-panel__id">
      id : <code>{{ node.id }}</code>
    </p>

    <!-- Meta strip : types + deadline -->
    <div class="tree-panel__meta">
      <span
        v-for="t in node.types && node.types.length ? node.types : ['editorial']"
        :key="t"
        class="type-pill"
        :class="`type-${t}`"
      >
        {{ vocab.page_types.find((p) => p.key === t)?.label ?? t }}
      </span>
      <span v-if="node?.deadline" class="deadline-pill">
        {{ vocab.deadlines.find((d) => d.key === node?.deadline)?.label ?? node?.deadline }}
      </span>
    </div>

    <!-- Description (TL;DR) -->
    <label class="field" style="margin-top: 0.75rem">
      <span>Description</span>
      <InlineEdit
        :value="node.tldr ?? ''"
        textarea
        :rows="3"
        :can-edit="canEdit"
        placeholder="Cliquer pour ajouter une description courte…"
        @update="(v) => patch({ tldr: v })"
        @edit-attempt="emit('edit-attempt')"
      />
    </label>

    <!-- Section 1 : Configuration détaillée -->
    <details class="panel" :open="isOpen('config')" @toggle="(e) => onToggle('config', e)">
      <summary>Configuration détaillée</summary>
      <div class="panel-body">
        <label class="field">
          <span>Échéance</span>
          <select
            class="fr-select"
            :value="node.deadline ?? ''"
            @change="(e) => patch({ deadline: (e.target as HTMLSelectElement).value })"
          >
            <option value="">— Aucune —</option>
            <option v-for="d in vocab.deadlines" :key="d.key" :value="d.key">{{ d.label }}</option>
          </select>
        </label>

        <fieldset class="fr-fieldset">
          <legend class="fr-fieldset__legend">Publics cibles</legend>
          <div
            class="fr-fieldset__content"
            style="display: flex; flex-wrap: wrap; gap: 0.5rem 1rem"
          >
            <label
              v-for="a in vocab.audiences"
              :key="a.key"
              class="fr-checkbox-group"
              style="font-size: 0.85rem"
            >
              <input
                type="checkbox"
                :checked="nodeAudiences.has(a.key)"
                @change="(e) => toggleAudience(a.key, (e.target as HTMLInputElement).checked)"
              />
              <span style="margin-left: 0.4rem">{{ a.label }}</span>
            </label>
          </div>
        </fieldset>

        <fieldset class="fr-fieldset">
          <legend class="fr-fieldset__legend">Types de page</legend>
          <div
            class="fr-fieldset__content"
            style="display: flex; flex-wrap: wrap; gap: 0.5rem 1rem"
          >
            <label
              v-for="t in vocab.page_types"
              :key="t.key"
              class="fr-checkbox-group"
              style="font-size: 0.85rem"
            >
              <input
                type="checkbox"
                :checked="nodeTypes.has(t.key)"
                @change="(e) => togglePageType(t.key, (e.target as HTMLInputElement).checked)"
              />
              <span style="margin-left: 0.4rem">{{ t.label }}</span>
            </label>
          </div>
        </fieldset>

        <div style="display: flex; gap: 0.5rem">
          <label class="field" style="flex: 1">
            <span>Charge Tech (j)</span>
            <input
              type="number"
              class="fr-input"
              :value="node.time_tech ?? ''"
              min="0"
              step="0.5"
              @input="onTimeTech"
            />
          </label>
          <label class="field" style="flex: 1">
            <span>Charge Édito (j)</span>
            <input
              type="number"
              class="fr-input"
              :value="node.time_edito ?? ''"
              min="0"
              step="0.5"
              @input="onTimeEdito"
            />
          </label>
        </div>
      </div>
    </details>

    <!-- Section 2 : Blocs de contenu -->
    <details class="panel" :open="isOpen('blocks')" @toggle="(e) => onToggle('blocks', e)">
      <summary>
        Blocs de contenu
        <span class="panel-count count-badge" :class="{ 'count-badge--muted': !blocks.length }">{{
          blocks.length
        }}</span>
      </summary>
      <div class="panel-body">
        <div v-for="(b, i) in blocks" :key="b.id" class="sub-item">
          <div class="sub-item-header">
            <strong style="flex: 1">Bloc {{ i + 1 }}</strong>
            <button class="fr-btn fr-btn--tertiary fr-btn--sm" @click="moveBlock(i, -1)">↑</button>
            <button class="fr-btn fr-btn--tertiary fr-btn--sm" @click="moveBlock(i, 1)">↓</button>
            <button
              class="fr-btn fr-btn--tertiary fr-btn--sm"
              style="color: #ce0500"
              @click="removeBlock(i)"
            >
              ×
            </button>
          </div>
          <label class="field">
            <span>Titre</span>
            <InlineEdit
              :value="b.title"
              :can-edit="canEdit"
              placeholder="Titre du bloc…"
              @update="(v) => updateBlock(i, 'title', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </label>
          <label class="field">
            <span>Description</span>
            <InlineEdit
              :value="b.description"
              textarea
              :rows="2"
              :can-edit="canEdit"
              placeholder="Description du bloc…"
              @update="(v) => updateBlock(i, 'description', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </label>
        </div>
        <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="addBlock">
          + Ajouter un bloc
        </button>
      </div>
    </details>

    <!-- Section 3 : Améliorations (alimentent la roadmap) -->
    <details
      class="panel"
      :open="isOpen('improvements')"
      @toggle="(e) => onToggle('improvements', e)"
    >
      <summary>
        Améliorations <small style="color: #888">(alimentent la roadmap)</small>
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !improvements.length }"
          >{{ improvements.length }}</span
        >
      </summary>
      <div class="panel-body">
        <div v-for="(it, i) in improvements" :key="it.id" class="sub-item">
          <div class="sub-item-header">
            <strong style="flex: 1">Amélioration {{ i + 1 }}</strong>
            <button
              class="fr-btn fr-btn--tertiary fr-btn--sm"
              style="color: #ce0500"
              @click="removeImprovement(i)"
            >
              ×
            </button>
          </div>
          <label class="field">
            <span>Titre</span>
            <InlineEdit
              :value="it.title"
              :can-edit="canEdit"
              placeholder="Titre court…"
              @update="(v) => updateImprovement(i, 'title', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </label>
          <label class="field">
            <span>Description</span>
            <InlineEdit
              :value="it.description"
              textarea
              :rows="2"
              :can-edit="canEdit"
              placeholder="Description…"
              @update="(v) => updateImprovement(i, 'description', v)"
              @edit-attempt="emit('edit-attempt')"
            />
          </label>
          <label class="field">
            <span>Échéance</span>
            <select
              class="fr-select"
              :value="it.deadline"
              @change="
                (e) => updateImprovement(i, 'deadline', (e.target as HTMLSelectElement).value)
              "
            >
              <option value="">— Aucune —</option>
              <option v-for="d in vocab.deadlines" :key="d.key" :value="d.key">
                {{ d.label }}
              </option>
            </select>
          </label>
        </div>
        <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="addImprovement">
          + Ajouter une amélioration
        </button>
      </div>
    </details>

    <!-- Section 4 : Mesures (politiques publiques) -->
    <details class="panel" :open="isOpen('mesures')" @toggle="(e) => onToggle('mesures', e)">
      <summary>
        Mesures rattachées
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !(node.mesures ?? []).length }"
        >
          {{ (node.mesures ?? []).length }}
        </span>
      </summary>
      <div class="panel-body">
        <p v-if="!mesuresCatalog.length" style="color: #888; font-size: 0.85rem">
          Aucune mesure dans le catalogue de ce projet.
        </p>
        <label
          v-for="m in mesuresCatalog"
          :key="m.id"
          style="display: flex; gap: 0.5rem; padding: 0.2rem 0; font-size: 0.9rem"
        >
          <input
            type="checkbox"
            :checked="(node.mesures ?? []).includes(m.id)"
            @change="(e) => toggleMesure(m.id, (e.target as HTMLInputElement).checked)"
          />
          <span
            ><strong>{{ m.id }}</strong> · {{ m.label }}</span
          >
        </label>
      </div>
    </details>

    <!-- Section 5 : Dispositifs -->
    <details
      class="panel"
      :open="isOpen('dispositifs')"
      @toggle="(e) => onToggle('dispositifs', e)"
    >
      <summary>
        Dispositifs liés
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !(node.dispositifs ?? []).length }"
        >
          {{ (node.dispositifs ?? []).length }}
        </span>
      </summary>
      <div class="panel-body">
        <p v-if="!dispositifsCatalog.length" style="color: #888; font-size: 0.85rem">
          Aucun dispositif dans le catalogue. Ajoutez-les dans la page Modèle de données.
        </p>
        <label
          v-for="d in dispositifsCatalog"
          :key="d.id"
          style="display: flex; gap: 0.5rem; padding: 0.2rem 0; font-size: 0.9rem"
        >
          <input
            type="checkbox"
            :checked="(node.dispositifs ?? []).includes(d.id)"
            @change="(e) => toggleDispositif(d.id, (e.target as HTMLInputElement).checked)"
          />
          <span>{{ d.name }}</span>
        </label>
      </div>
    </details>

    <!-- Section 6 : Objectifs liés (lecture seule, alimentée par la page Objectifs) -->
    <details class="panel" :open="isOpen('objectives')" @toggle="(e) => onToggle('objectives', e)">
      <summary>
        Objectifs couverts
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !meansForNode.length }"
        >
          {{ meansForNode.length }}
        </span>
      </summary>
      <div class="panel-body">
        <p v-if="!meansForNode.length" style="color: #888; font-size: 0.85rem">
          Aucun moyen de la pyramide stratégique ne cible ce nœud. Pour en ajouter, allez à l'onglet
          « Objectifs ».
        </p>
        <ul v-else style="padding-left: 1rem; font-size: 0.9rem">
          <li v-for="(m, idx) in meansForNode" :key="idx" style="margin-bottom: 0.4rem">
            <strong>{{ m.axeName }}</strong> · {{ m.objectiveName }}
            <br />
            <small style="color: #666">{{ m.meanText }}</small>
          </li>
        </ul>
      </div>
    </details>

    <!-- Section 7 : Maquette (raccourci) -->
    <details class="panel" :open="isOpen('maquette')" @toggle="(e) => onToggle('maquette', e)">
      <summary>
        Maquette DSFR
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !maquetteParagraphCount }"
        >
          {{ maquetteParagraphCount }}
        </span>
      </summary>
      <div class="panel-body">
        <p style="font-size: 0.9rem; color: #555">
          <span v-if="!maquetteParagraphCount">Pas encore de paragraph configuré sur ce nœud.</span>
          <span v-else>{{ maquetteParagraphCount }} paragraph(s) configuré(s).</span>
          <br />
          <small>Édition complète dans l'onglet « Maquette ».</small>
        </p>
      </div>
    </details>

    <!-- Section 8 : Commentaires -->
    <details class="panel" :open="isOpen('comments')" @toggle="(e) => onToggle('comments', e)">
      <summary>Commentaires</summary>
      <div class="panel-body">
        <NodeComments :slug="slug" :node-id="node.id" />
      </div>
    </details>

    <!-- Actions globales -->
    <div class="tree-panel__actions">
      <button class="fr-btn fr-btn--sm" @click="emit('add-child')">+ Sous-rubrique</button>
      <template v-if="!isRoot">
        <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="emit('move-sibling', -1)">
          ↑ Monter
        </button>
        <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="emit('move-sibling', 1)">
          ↓ Descendre
        </button>
        <button
          class="fr-btn fr-btn--secondary fr-btn--sm"
          @click="emit('promote')"
          title="Sortir d'un niveau"
        >
          ↖ Promouvoir
        </button>
        <button
          class="fr-btn fr-btn--secondary fr-btn--sm"
          @click="emit('demote')"
          title="Devenir enfant du frère précédent"
        >
          ↘ Démouvoir
        </button>
        <button
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          style="color: #ce0500"
          @click="emit('delete-node')"
        >
          🗑 Supprimer
        </button>
      </template>
    </div>
  </aside>

  <aside v-else class="tree-panel l-card">
    <p style="color: #888">Sélectionnez un nœud dans l'arborescence.</p>
  </aside>
</template>

<style scoped>
.tree-panel {
  position: sticky;
  top: 5rem;
  max-height: calc(100vh - 7rem);
  overflow-y: auto;
}
.tree-panel__title :deep(.inline-edit__display) {
  font-size: 1.15rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
}
.tree-panel__id {
  color: #888;
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}
.tree-panel__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.4rem;
  margin-bottom: 0.5rem;
}
.tree-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
}
.sub-item {
  background: #fafafa;
  border-left: 3px solid #000091;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 3px;
}
.sub-item-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
</style>
