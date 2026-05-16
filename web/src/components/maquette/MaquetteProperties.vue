<script setup lang="ts">
// Panneau "Propriétés Drupal" du nœud sélectionné en page Maquette.
// Reproduit la sidebar v1 (legacy assets/maquette.js renderTaxonomy*) :
//
//   - Type de contenu Drupal SFD (sélecteur)
//   - Type éditorial (sélecteur)
//   - Public (multi-select tags cliquables, depuis vocab.audiences)
//   - Mesure (multi-select tags grid, depuis catalogue mesures)
//
// Toutes ces valeurs vivent dans `node.maquette.taxonomy.*` et sont
// persistées via le tree (updateNode → save).

import { computed } from 'vue';
import type { VocabConfig } from '@latelier/shared';

const props = defineProps<{
  /** Données complètes de la maquette du nœud. */
  maquette: Record<string, unknown> | null;
  /** Vocab du projet (audiences, deadlines, page_types). */
  vocab: VocabConfig;
  /** Catalogue des mesures du projet (M1, M2…). */
  mesuresCatalog: ReadonlyArray<{ id: string; label: string }>;
  /** Types de contenu Drupal (extraits de drupal_structure ou hardcodés). */
  drupalTypes: ReadonlyArray<{ key: string; label: string }>;
  /** Types éditoriaux disponibles. */
  editorialTypes: ReadonlyArray<{ key: string; label: string }>;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'update-taxonomy', patch: Record<string, unknown>): void;
  (e: 'edit-attempt'): void;
}>();

const taxonomy = computed<Record<string, unknown>>(() => {
  const m = props.maquette ?? {};
  const t = (m['taxonomy'] as Record<string, unknown> | undefined) ?? {};
  return t;
});

function setTaxonomy(key: string, value: unknown): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  emit('update-taxonomy', { ...taxonomy.value, [key]: value });
}

function setDrupalType(e: Event): void {
  setTaxonomy('drupal_type', (e.target as HTMLSelectElement).value);
}

function setEditorialType(e: Event): void {
  setTaxonomy('editorial_type', (e.target as HTMLSelectElement).value);
}

const audienceSet = computed(() => {
  const v = taxonomy.value['cibles'] ?? taxonomy.value['audiences'];
  return new Set(Array.isArray(v) ? (v as string[]) : []);
});

function toggleAudience(key: string): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  const next = new Set(audienceSet.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  setTaxonomy('cibles', Array.from(next));
}

const mesureSet = computed(() => {
  const v = taxonomy.value['mesures'];
  return new Set(Array.isArray(v) ? (v as string[]) : []);
});

function toggleMesure(id: string): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  const next = new Set(mesureSet.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setTaxonomy('mesures', Array.from(next));
}
</script>

<template>
  <aside class="maquette-props l-card">
    <h3 style="margin-top: 0; font-size: 1.1rem">Propriétés Drupal</h3>

    <label class="field">
      <span>Type de contenu Drupal SFD</span>
      <select
        class="fr-select"
        :value="(taxonomy.drupal_type as string | undefined) ?? ''"
        @change="setDrupalType"
      >
        <option value="">— aucun —</option>
        <option v-for="t in drupalTypes" :key="t.key" :value="t.key">{{ t.label }}</option>
      </select>
    </label>

    <label class="field">
      <span>Type éditorial</span>
      <select
        class="fr-select"
        :value="(taxonomy.editorial_type as string | undefined) ?? ''"
        @change="setEditorialType"
      >
        <option value="">— aucun —</option>
        <option v-for="t in editorialTypes" :key="t.key" :value="t.key">{{ t.label }}</option>
      </select>
    </label>

    <div class="field">
      <span>Public</span>
      <div class="tag-cloud">
        <button
          v-for="a in vocab.audiences"
          :key="a.key"
          type="button"
          class="tag-btn"
          :class="{ 'tag-btn--active': audienceSet.has(a.key) }"
          @click="toggleAudience(a.key)"
        >
          {{ a.label }}
        </button>
      </div>
    </div>

    <div v-if="mesuresCatalog.length > 0" class="field">
      <span>Mesure ({{ mesureSet.size }} / {{ mesuresCatalog.length }})</span>
      <div class="tag-cloud tag-cloud--compact">
        <button
          v-for="m in mesuresCatalog"
          :key="m.id"
          type="button"
          class="tag-btn tag-btn--compact"
          :class="{ 'tag-btn--active': mesureSet.has(m.id) }"
          :title="m.label"
          @click="toggleMesure(m.id)"
        >
          {{ m.id }}
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.maquette-props {
  position: sticky;
  top: 5rem;
  max-height: calc(100vh - 7rem);
  overflow-y: auto;
}
.field {
  display: block;
  margin-bottom: 1rem;
}
.field > span {
  display: block;
  font-size: 0.85rem;
  color: #555;
  font-weight: 500;
  margin-bottom: 0.3rem;
}
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.tag-cloud--compact {
  gap: 0.2rem;
}
.tag-btn {
  background: white;
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 0.2rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: #555;
  font: inherit;
  font-size: 0.8rem;
  transition: all 0.1s;
}
.tag-btn:hover {
  border-color: #000091;
  color: #000091;
}
.tag-btn--active {
  background: #000091;
  color: white;
  border-color: #000091;
}
.tag-btn--compact {
  padding: 0.15rem 0.5rem;
  min-width: 2.5rem;
  text-align: center;
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
}
</style>
