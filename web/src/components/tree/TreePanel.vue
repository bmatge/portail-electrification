<script setup lang="ts">
// Panneau détail d'un nœud — porté complètement depuis le legacy
// assets/script.js (renderPanel + renderBlocksSection + renderMesuresSection
// + renderDispositifsSection + renderObjectivesSection + renderImprovementsSection
// + renderMaquetteSection + renderCommentsSection).
//
// Ergonomie : édition inline cliquable (InlineEdit), accordéons stateful
// (state survit aux re-renders), boutons DSFR fr-btn + fr-icon-*.

import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { TreeNode } from '../../stores/tree.js';
import type { VocabConfig } from '@latelier/shared';
import { audiencesFor } from '../../composables/useTreeEditor.js';
import InlineEdit from '../ui/InlineEdit.vue';
import MultiSelect from '../ui/MultiSelect.vue';
import NodeComments from './NodeComments.vue';
import NodeImprovements from './NodeImprovements.vue';

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
  /** Tous les moyens disponibles dans la pyramide objectifs du projet. */
  allMeans: ReadonlyArray<{
    id: string;
    axeName: string;
    objectiveName: string;
    meanText: string;
  }>;
  /** Ids des moyens actuellement reliés à ce nœud. */
  linkedMeanIds: readonly string[];
}>();

const emit = defineEmits<{
  (e: 'patch', payload: { id: string; patch: Partial<TreeNode> }): void;
  (e: 'add-child'): void;
  (e: 'delete-node'): void;
  (e: 'move-sibling', direction: -1 | 1): void;
  (e: 'promote'): void;
  (e: 'demote'): void;
  (e: 'edit-attempt'): void;
  (e: 'set-linked-means', ids: string[]): void;
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
// Par défaut : Configuration détaillée + Commentaires (les 2 plus
// utilisées). L'utilisateur peut replier librement.
const openSections = ref<Set<string>>(new Set(['config', 'comments']));
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

// Publics hérités du parent : on retire le nœud courant du calcul puis on
// regarde ce que ses ancêtres lui apportent. Si le nœud a ses propres
// audiences, on les ignore aussi pour ne montrer QUE l'héritage.
const inheritedAudiences = computed<readonly string[]>(() => {
  if (!props.root || !props.node) return [];
  // Le nœud doit être analysé comme s'il n'avait pas d'audiences propres
  // pour récupérer l'apport des ancêtres seulement.
  const cloneNode = { ...props.node, audiences: [] as string[] };
  return Array.from(audiencesFor(props.root, cloneNode));
});

function inheritedLabels(): string {
  const map = new Map(props.vocab.audiences.map((a) => [a.key, a.label]));
  return inheritedAudiences.value.map((k) => map.get(k) ?? k).join(', ');
}

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
function setMesures(next: string[]): void {
  patch({ mesures: next });
}
function setDispositifs(next: string[]): void {
  patch({ dispositifs: next });
}

// Options du multi-select pour Ressources liées (= catalogue dispositifs)
const dispositifsOptions = computed(() =>
  props.dispositifsCatalog.map((d) => ({ value: d.id, label: d.name })),
);
// Options du multi-select pour Politiques liées (= catalogue mesures)
const mesuresOptions = computed(() =>
  props.mesuresCatalog.map((m) => ({ value: m.id, label: m.label, meta: m.id })),
);
// Options du multi-select pour Objectifs liés (= moyens de la pyramide)
const meansOptions = computed(() =>
  props.allMeans.map((m) => ({
    value: m.id,
    label: `${m.axeName} · ${m.objectiveName} · ${m.meanText}`,
  })),
);

function setLinkedMeans(next: string[]): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  emit('set-linked-means', next);
}

// --- Compteurs (mutualisés depuis le node) -------------------------------
// Les "improvements" sont gérées par le composant NodeImprovements ; on
// garde juste le compteur pour le badge de la section. Les "blocks" du
// legacy ne sont plus exposés (couverts par la Maquette).
const improvementsCount = computed(() => {
  const v = props.node?.['improvements'];
  return Array.isArray(v) ? v.length : 0;
});

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
        <div class="fr-input-group">
          <label class="fr-label">Échéance</label>
          <div class="chip-row">
            <button
              v-for="d in vocab.deadlines"
              :key="d.key"
              type="button"
              class="chip-toggle"
              :class="`chip-toggle--deadline-${d.key}`"
              :aria-pressed="node.deadline === d.key"
              :disabled="!canEdit"
              @click="patch({ deadline: node.deadline === d.key ? '' : d.key })"
            >
              {{ d.label }}
            </button>
          </div>
        </div>

        <div class="fr-input-group">
          <label class="fr-label">Publics cibles (hérités du parent si vide)</label>
          <div class="chip-row">
            <button
              v-for="a in vocab.audiences"
              :key="a.key"
              type="button"
              class="chip-toggle"
              :class="`chip-toggle--audience-${a.key}`"
              :aria-pressed="nodeAudiences.has(a.key)"
              :disabled="!canEdit"
              @click="toggleAudience(a.key, !nodeAudiences.has(a.key))"
            >
              {{ a.label }}
            </button>
          </div>
          <p class="fr-text--xs chip-hint">
            <template v-if="inheritedAudiences.length === 0">
              Aucun public hérité du parent.
            </template>
            <template v-else> Hérités du parent : {{ inheritedLabels() }}. </template>
          </p>
        </div>

        <div class="fr-input-group">
          <label class="fr-label">Types de page</label>
          <div class="chip-row">
            <button
              v-for="t in vocab.page_types"
              :key="t.key"
              type="button"
              class="chip-toggle"
              :class="`chip-toggle--type-${t.key}`"
              :aria-pressed="nodeTypes.has(t.key)"
              :disabled="!canEdit"
              @click="togglePageType(t.key, !nodeTypes.has(t.key))"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

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

    <!-- Section : Maquette (raccourci, édition complète dans l'onglet) -->
    <details class="panel" :open="isOpen('maquette')" @toggle="(e) => onToggle('maquette', e)">
      <summary>
        Maquette
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !maquetteParagraphCount }"
        >
          {{ maquetteParagraphCount }}
        </span>
      </summary>
      <div class="panel-body">
        <p style="font-size: 0.9rem; color: #555; margin: 0 0 0.6rem">
          <span v-if="!maquetteParagraphCount">Aucun composant configuré sur ce nœud.</span>
          <span v-else>{{ maquetteParagraphCount }} composant(s) configuré(s).</span>
        </p>
        <RouterLink
          :to="{ name: 'project-maquette', params: { slug }, query: { node: node.id } }"
          class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-arrow-right-line fr-btn--icon-right"
        >
          {{ maquetteParagraphCount ? 'Éditer la maquette' : 'Démarrer la maquette' }}
        </RouterLink>
      </div>
    </details>

    <!-- Section : Améliorations (alimentent la roadmap) -->
    <details
      class="panel"
      :open="isOpen('improvements')"
      @toggle="(e) => onToggle('improvements', e)"
    >
      <summary>
        Améliorations <small style="color: #888">(alimentent la roadmap)</small>
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !improvementsCount }"
          >{{ improvementsCount }}</span
        >
      </summary>
      <div class="panel-body">
        <NodeImprovements
          :node="node"
          :vocab="vocab"
          :can-edit="canEdit"
          @patch="(p) => patch(p)"
          @edit-attempt="emit('edit-attempt')"
        />
      </div>
    </details>

    <!-- Section : Objectifs liés — édition via MultiSelect, persistance
         côté store objectifs gérée par le parent (ProjectTreePage). -->
    <details class="panel" :open="isOpen('objectives')" @toggle="(e) => onToggle('objectives', e)">
      <summary>
        Objectifs liés
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !linkedMeanIds.length }"
        >
          {{ linkedMeanIds.length }}
        </span>
      </summary>
      <div class="panel-body">
        <p v-if="!allMeans.length" style="color: #888; font-size: 0.85rem; margin: 0">
          Aucun moyen dans la pyramide stratégique. Ajoutez-en dans l'onglet
          <RouterLink :to="{ name: 'project-objectifs', params: { slug } }">Objectifs</RouterLink>.
        </p>
        <template v-else>
          <MultiSelect
            :options="meansOptions"
            :selected="linkedMeanIds"
            :disabled="!canEdit"
            placeholder="Rattacher ce nœud à des objectifs…"
            @update:selected="setLinkedMeans"
          />
          <!-- Liste résumée des objectifs actuellement liés, pour lisibilité. -->
          <ul
            v-if="linkedMeanIds.length"
            style="padding-left: 1rem; font-size: 0.85rem; margin: 0.6rem 0 0"
          >
            <li
              v-for="m in allMeans.filter((x) => linkedMeanIds.includes(x.id))"
              :key="m.id"
              style="margin-bottom: 0.3rem"
            >
              <strong>{{ m.axeName }}</strong> · {{ m.objectiveName }}
              <br />
              <small style="color: #666">{{ m.meanText }}</small>
            </li>
          </ul>
        </template>
      </div>
    </details>

    <!-- Section : Ressources liées (= dispositifs) -->
    <details
      class="panel"
      :open="isOpen('dispositifs')"
      @toggle="(e) => onToggle('dispositifs', e)"
    >
      <summary>
        Ressources liées
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !(node.dispositifs ?? []).length }"
        >
          {{ (node.dispositifs ?? []).length }}
        </span>
      </summary>
      <div class="panel-body">
        <p v-if="!dispositifsCatalog.length" style="color: #888; font-size: 0.85rem; margin: 0">
          Aucune ressource dans le catalogue. Ajoutez-en dans la page « Ressources & services ».
        </p>
        <MultiSelect
          v-else
          :options="dispositifsOptions"
          :selected="node.dispositifs ?? []"
          :disabled="!canEdit"
          placeholder="Choisir des ressources…"
          @update:selected="setDispositifs"
        />
      </div>
    </details>

    <!-- Section : Politiques liées (= mesures) -->
    <details class="panel" :open="isOpen('mesures')" @toggle="(e) => onToggle('mesures', e)">
      <summary>
        Politiques liées
        <span
          class="panel-count count-badge"
          :class="{ 'count-badge--muted': !(node.mesures ?? []).length }"
        >
          {{ (node.mesures ?? []).length }}
        </span>
      </summary>
      <div class="panel-body">
        <p v-if="!mesuresCatalog.length" style="color: #888; font-size: 0.85rem; margin: 0">
          Aucune politique dans le catalogue. Ajoutez-en dans la page « Politiques publiques ».
        </p>
        <MultiSelect
          v-else
          :options="mesuresOptions"
          :selected="node.mesures ?? []"
          :disabled="!canEdit"
          placeholder="Choisir des politiques…"
          @update:selected="setMesures"
        />
      </div>
    </details>

    <!-- Section : Commentaires (ouverte par défaut) -->
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
  /* `align-self: start` côté grid + sticky permet au panel de rester
   * collé en haut quand on scrolle la liste de l'arbre, sans introduire
   * de scroll interne (qui posait problème quand un MultiSelect ouvert
   * débordait → triple scroll). Si le panel dépasse la viewport, on
   * scrolle la page entière. */
  position: sticky;
  top: 5rem;
  align-self: start;
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
