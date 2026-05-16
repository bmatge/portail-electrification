<script setup lang="ts">
// Section "Améliorations" d'un nœud — extraite de TreePanel pour être
// mutualisée avec la page Maquette. Émet `patch` quand la liste change.
// Les améliorations alimentent la roadmap (page Roadmap).

import { computed } from 'vue';
import type { TreeNode } from '../../stores/tree.js';
import type { VocabConfig } from '@latelier/shared';
import InlineEdit from '../ui/InlineEdit.vue';

const props = defineProps<{
  node: TreeNode;
  vocab: VocabConfig;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'patch', patch: Partial<TreeNode>): void;
  (e: 'edit-attempt'): void;
}>();

interface Improvement {
  id: string;
  title: string;
  description: string;
  deadline: string;
}

const improvements = computed<Improvement[]>(() => {
  const v = props.node['improvements'];
  return Array.isArray(v) ? (v as Improvement[]) : [];
});

function newImprovementId(): string {
  return 'i' + Math.random().toString(36).slice(2, 8);
}

function patchList(next: Improvement[]): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  emit('patch', { improvements: next } as Partial<TreeNode>);
}

function addImprovement(): void {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  patchList([
    ...improvements.value,
    { id: newImprovementId(), title: '', description: '', deadline: '' },
  ]);
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
  patchList(next);
}

function removeImprovement(idx: number): void {
  const next = improvements.value.slice();
  next.splice(idx, 1);
  patchList(next);
}

defineExpose({ improvements });
</script>

<template>
  <div class="node-improvements">
    <div v-for="(it, i) in improvements" :key="it.id" class="sub-item">
      <div class="sub-item-header">
        <strong style="flex: 1">Amélioration {{ i + 1 }}</strong>
        <button
          v-if="canEdit"
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          style="color: #ce0500"
          title="Supprimer"
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
          @update="(v: string) => updateImprovement(i, 'title', v)"
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
          @update="(v: string) => updateImprovement(i, 'description', v)"
          @edit-attempt="emit('edit-attempt')"
        />
      </label>
      <div class="field">
        <span>Échéance</span>
        <div class="chip-row">
          <button
            v-for="d in vocab.deadlines"
            :key="d.key"
            type="button"
            class="chip-toggle"
            :class="`chip-toggle--deadline-${d.key}`"
            :aria-pressed="it.deadline === d.key"
            :disabled="!canEdit"
            @click="updateImprovement(i, 'deadline', it.deadline === d.key ? '' : d.key)"
          >
            {{ d.label }}
          </button>
        </div>
      </div>
    </div>
    <button
      v-if="canEdit"
      class="fr-btn fr-btn--secondary fr-btn--sm fr-icon-add-line fr-btn--icon-left"
      @click="addImprovement"
    >
      Ajouter une amélioration
    </button>
  </div>
</template>

<style scoped>
.sub-item {
  background: #fafafa;
  border-left: 3px solid var(--text-action-high-blue-france, #000091);
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 3px;
}
.sub-item-header {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.4rem;
}
.field {
  display: block;
  margin-bottom: 0.5rem;
}
.field > span {
  display: block;
  font-size: 0.8rem;
  color: var(--text-mention-grey, #666);
  font-weight: 500;
  margin-bottom: 0.2rem;
}
</style>
