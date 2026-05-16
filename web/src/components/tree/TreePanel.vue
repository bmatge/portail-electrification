<script setup lang="ts">
import { computed } from 'vue';
import type { TreeNode } from '../../stores/tree.js';
import type { VocabConfig } from '@latelier/shared';

const props = defineProps<{
  node: TreeNode | null;
  isRoot: boolean;
  vocab: VocabConfig;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'patch', payload: { id: string; patch: Partial<TreeNode> }): void;
  (e: 'add-child'): void;
  (e: 'delete-node'): void;
  (e: 'move-sibling', direction: -1 | 1): void;
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

function onLabel(e: Event): void {
  patch({ label: (e.target as HTMLInputElement).value });
}

function onTldr(e: Event): void {
  patch({ tldr: (e.target as HTMLTextAreaElement).value });
}

function onDeadline(e: Event): void {
  patch({ deadline: (e.target as HTMLSelectElement).value });
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

function onTimeTech(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  patch({ time_tech: v === '' ? null : Number(v) });
}

function onTimeEdito(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  patch({ time_edito: v === '' ? null : Number(v) });
}

const nodeAudiences = computed(() => new Set(props.node?.audiences ?? []));
const nodeTypes = computed(() => new Set(props.node?.types ?? []));
</script>

<template>
  <aside class="tree-panel l-card" v-if="node">
    <label class="field">
      <span>Libellé</span>
      <input
        type="text"
        class="input"
        :value="node.label"
        :disabled="!canEdit && false /* affichage lecture seule via @input intercept */"
        @input="onLabel"
      />
    </label>
    <p class="panel-id">
      id : <code>{{ node.id }}</code>
    </p>

    <label class="field">
      <span>Description (TL;DR)</span>
      <textarea rows="3" :value="node.tldr ?? ''" @input="onTldr"></textarea>
    </label>

    <details class="panel" open>
      <summary>Configuration</summary>
      <div class="panel-body">
        <label class="field">
          <span>Échéance</span>
          <select :value="node.deadline ?? ''" @change="onDeadline" class="input">
            <option value="">— Aucune —</option>
            <option v-for="d in vocab.deadlines" :key="d.key" :value="d.key">{{ d.label }}</option>
          </select>
        </label>

        <fieldset style="border: 1px solid #ddd; padding: 0.5rem; border-radius: 4px">
          <legend style="font-size: 0.85rem; color: #555">Publics cibles</legend>
          <label
            v-for="a in vocab.audiences"
            :key="a.key"
            style="display: inline-flex; gap: 0.25rem; margin-right: 0.75rem; font-size: 0.85rem"
          >
            <input
              type="checkbox"
              :checked="nodeAudiences.has(a.key)"
              @change="(e) => toggleAudience(a.key, (e.target as HTMLInputElement).checked)"
            />
            {{ a.label }}
          </label>
        </fieldset>

        <fieldset
          style="border: 1px solid #ddd; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem"
        >
          <legend style="font-size: 0.85rem; color: #555">Types de page</legend>
          <label
            v-for="t in vocab.page_types"
            :key="t.key"
            style="display: inline-flex; gap: 0.25rem; margin-right: 0.75rem; font-size: 0.85rem"
          >
            <input
              type="checkbox"
              :checked="nodeTypes.has(t.key)"
              @change="(e) => togglePageType(t.key, (e.target as HTMLInputElement).checked)"
            />
            {{ t.label }}
          </label>
        </fieldset>

        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem">
          <label class="field" style="flex: 1">
            <span>Charge Tech (j)</span>
            <input
              type="number"
              :value="node.time_tech ?? ''"
              @input="onTimeTech"
              min="0"
              step="0.5"
              class="input"
            />
          </label>
          <label class="field" style="flex: 1">
            <span>Charge Édito (j)</span>
            <input
              type="number"
              :value="node.time_edito ?? ''"
              @input="onTimeEdito"
              min="0"
              step="0.5"
              class="input"
            />
          </label>
        </div>
      </div>
    </details>

    <div
      class="panel-actions"
      style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem"
    >
      <button class="btn" type="button" @click="emit('add-child')">+ Sous-rubrique</button>
      <template v-if="!isRoot">
        <button class="btn-outline btn" type="button" @click="emit('move-sibling', -1)">
          ↑ Monter
        </button>
        <button class="btn-outline btn" type="button" @click="emit('move-sibling', 1)">
          ↓ Descendre
        </button>
        <button class="btn" type="button" style="background: #b03a3a" @click="emit('delete-node')">
          Supprimer
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
  top: 1rem;
  max-height: calc(100vh - 8rem);
  overflow: auto;
}
.panel-id {
  color: #888;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}
</style>
