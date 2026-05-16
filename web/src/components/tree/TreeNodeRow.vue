<script setup lang="ts">
import { computed } from 'vue';
import type { TreeNode } from '../../stores/tree.js';
import type { VocabConfig } from '@latelier/shared';

const props = defineProps<{
  node: TreeNode;
  depth: number;
  selectedId: string;
  collapsed: ReadonlySet<string>;
  inheritedAudiences: readonly string[];
  vocab: VocabConfig;
  canEdit: boolean;
  isRoot: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'toggle-collapse', id: string): void;
  (
    e: 'drop-here',
    payload: { sourceId: string; targetId: string; mode: 'before' | 'after' | 'child' },
  ): void;
}>();

const hasChildren = computed(() => (props.node.children ?? []).length > 0);
const isCollapsed = computed(() => props.collapsed.has(props.node.id));
const isSelected = computed(() => props.selectedId === props.node.id);

const audienceLabels = computed(() => {
  const map = new Map(props.vocab.audiences.map((a) => [a.key, a.label]));
  return props.inheritedAudiences.map((k) => ({ key: k, label: map.get(k) ?? k }));
});

const deadlineLabel = computed(() => {
  if (!props.node.deadline) return null;
  return (
    props.vocab.deadlines.find((d) => d.key === props.node.deadline)?.label ?? props.node.deadline
  );
});

function onDragStart(e: DragEvent): void {
  if (!props.canEdit || props.isRoot) return;
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', props.node.id);
}

function onDragOver(e: DragEvent): void {
  if (!props.canEdit) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const row = e.currentTarget as HTMLElement;
  const rect = row.getBoundingClientRect();
  const offset = e.clientY - rect.top;
  row.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-child');
  if (offset < rect.height * 0.25) row.classList.add('drag-over-before');
  else if (offset > rect.height * 0.75) row.classList.add('drag-over-after');
  else row.classList.add('drag-over-child');
}

function onDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove(
    'drag-over-before',
    'drag-over-after',
    'drag-over-child',
  );
}

function onDrop(e: DragEvent): void {
  if (!props.canEdit) return;
  e.preventDefault();
  const row = e.currentTarget as HTMLElement;
  const sourceId = e.dataTransfer?.getData('text/plain');
  let mode: 'before' | 'after' | 'child' = 'after';
  if (row.classList.contains('drag-over-before')) mode = 'before';
  else if (row.classList.contains('drag-over-child')) mode = 'child';
  row.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-child');
  if (sourceId && sourceId !== props.node.id) {
    emit('drop-here', { sourceId, targetId: props.node.id, mode });
  }
}
</script>

<template>
  <div
    class="flat-row"
    :class="{ selected: isSelected }"
    :style="{ '--depth': String(depth) }"
    :draggable="canEdit && !isRoot"
    role="treeitem"
    :aria-level="depth + 1"
    @click="emit('select', node.id)"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <button
      type="button"
      class="flat-row__toggle"
      :class="{ 'flat-row__toggle--placeholder': !hasChildren }"
      :aria-hidden="hasChildren ? undefined : 'true'"
      :tabindex="hasChildren ? 0 : -1"
      @click.stop="hasChildren && emit('toggle-collapse', node.id)"
    >
      <span v-if="hasChildren">{{ isCollapsed ? '▸' : '▾' }}</span>
    </button>
    <div class="flat-row__audience">
      <span
        v-for="a in audienceLabels"
        :key="a.key"
        class="audience-tag"
        :class="{ 'audience-tag--inherited': !(node.audiences && node.audiences.length) }"
      >
        {{ a.label }}
      </span>
    </div>
    <div class="flat-row__text">
      <span class="flat-row__label">{{ node.label }}</span>
    </div>
    <div class="flat-row__tags">
      <span v-if="deadlineLabel" class="deadline-pill" :class="node.deadline">
        {{ deadlineLabel }}
      </span>
      <span v-if="(node.blocks ?? []).length > 0" class="blocks-pill">
        ▦ {{ (node.blocks ?? []).length }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.flat-row {
  display: grid;
  grid-template-columns: calc(1.25rem + var(--depth, 0) * 1.25rem) auto 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid #eee;
  background: white;
  cursor: pointer;
  user-select: none;
}
.flat-row:hover {
  background: #f7f8ff;
}
.flat-row.selected {
  background: #e3e9ff;
  border-left: 3px solid #000091;
}
.flat-row__toggle {
  border: none;
  background: none;
  text-align: right;
  color: #555;
  cursor: pointer;
}
.flat-row__toggle--placeholder {
  cursor: default;
  visibility: hidden;
}
.flat-row__audience {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.audience-tag {
  background: #d4e2ff;
  color: #00146b;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
}
.audience-tag--inherited {
  background: #eee;
  color: #555;
}
.flat-row__label {
  font-weight: 500;
}
.flat-row__tags {
  display: flex;
  gap: 0.25rem;
}
.deadline-pill {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #fff3cd;
  color: #553f00;
  font-size: 0.75rem;
}
.blocks-pill {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #e0e0e0;
  color: #444;
  font-size: 0.75rem;
}
.flat-row.drag-over-before {
  box-shadow: 0 -3px 0 #000091 inset;
}
.flat-row.drag-over-after {
  box-shadow: 0 3px 0 #000091 inset;
}
.flat-row.drag-over-child {
  background: #d1e4ff;
}
</style>
