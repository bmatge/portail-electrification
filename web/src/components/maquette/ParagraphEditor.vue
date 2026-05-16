<script setup lang="ts">
// Éditeur universel pour un paragraph DSFR. Choisit la forme d'édition à
// partir du `kind` du schéma : text (string), simple (objet), items (array).
// Couvre les 17 PARAGRAPH_SCHEMAS d'un seul tenant.

import { computed } from 'vue';
import { PARAGRAPH_SCHEMAS, PARAGRAPH_LABELS, defaultsFor } from '@latelier/shared';

const props = defineProps<{
  code: string;
  data: unknown;
  canEdit: boolean;
}>();
const emit = defineEmits<{
  (e: 'update', data: unknown): void;
  (e: 'edit-attempt'): void;
}>();

const schema = computed(() => PARAGRAPH_SCHEMAS[props.code] ?? null);
const label = computed(() => PARAGRAPH_LABELS[props.code] ?? props.code);

function ensureEdit(): boolean {
  if (props.canEdit) return true;
  emit('edit-attempt');
  return false;
}

function updateTextField(value: string): void {
  if (!ensureEdit()) return;
  emit('update', value);
}

function updateSimpleField(key: string, value: string): void {
  if (!ensureEdit()) return;
  const cur = (
    props.data && typeof props.data === 'object' ? { ...(props.data as object) } : {}
  ) as Record<string, unknown>;
  cur[key] = value;
  emit('update', cur);
}

function updateItemField(index: number, key: string, value: string): void {
  if (!ensureEdit()) return;
  const arr = Array.isArray(props.data) ? props.data.slice() : [];
  const item = (
    typeof arr[index] === 'object' && arr[index] !== null ? { ...(arr[index] as object) } : {}
  ) as Record<string, unknown>;
  item[key] = value;
  arr[index] = item;
  emit('update', arr);
}

function addItem(): void {
  if (!ensureEdit()) return;
  const s = schema.value;
  if (!s || s.kind !== 'items') return;
  const arr = Array.isArray(props.data) ? props.data.slice() : [];
  const blank: Record<string, string> = {};
  for (const f of s.fields ?? []) blank[f.key] = '';
  arr.push(blank);
  emit('update', arr);
}

function removeItem(index: number): void {
  if (!ensureEdit()) return;
  const arr = Array.isArray(props.data) ? props.data.slice() : [];
  arr.splice(index, 1);
  emit('update', arr);
}

function moveItem(index: number, dir: -1 | 1): void {
  if (!ensureEdit()) return;
  const arr = Array.isArray(props.data) ? props.data.slice() : [];
  const j = index + dir;
  if (j < 0 || j >= arr.length) return;
  const a = arr[index];
  const b = arr[j];
  arr[index] = b;
  arr[j] = a;
  emit('update', arr);
}

function resetToDefaults(): void {
  if (!ensureEdit()) return;
  emit('update', defaultsFor(props.code));
}

const asString = computed(() => (typeof props.data === 'string' ? props.data : ''));
const asObject = computed(
  () =>
    (props.data && typeof props.data === 'object' && !Array.isArray(props.data)
      ? (props.data as Record<string, unknown>)
      : {}) as Record<string, unknown>,
);
const asArray = computed(() =>
  Array.isArray(props.data) ? (props.data as Record<string, unknown>[]) : [],
);
</script>

<template>
  <div class="paragraph-editor" v-if="schema">
    <div class="paragraph-header">
      <strong>{{ label }}</strong>
      <span style="color: #888; font-size: 0.8rem">({{ code }})</span>
      <span class="spacer"></span>
      <button v-if="canEdit" class="btn-outline btn" type="button" @click="resetToDefaults">
        Réinitialiser
      </button>
    </div>

    <div v-if="schema.kind === 'text'" class="paragraph-body">
      <textarea
        v-if="schema.textarea"
        rows="3"
        :value="asString"
        @input="(e) => updateTextField((e.target as HTMLTextAreaElement).value)"
      ></textarea>
      <input
        v-else
        type="text"
        class="input"
        :value="asString"
        @input="(e) => updateTextField((e.target as HTMLInputElement).value)"
      />
    </div>

    <div v-else-if="schema.kind === 'simple'" class="paragraph-body">
      <label v-for="f in schema.fields" :key="f.key" class="field">
        <span>{{ f.label }}</span>
        <textarea
          v-if="f.textarea"
          rows="2"
          :value="(asObject[f.key] as string | undefined) ?? ''"
          @input="(e) => updateSimpleField(f.key, (e.target as HTMLTextAreaElement).value)"
        ></textarea>
        <input
          v-else
          :type="f.type ?? 'text'"
          class="input"
          :value="(asObject[f.key] as string | undefined) ?? ''"
          @input="(e) => updateSimpleField(f.key, (e.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <div v-else-if="schema.kind === 'items'" class="paragraph-body">
      <div v-for="(item, i) in asArray" :key="i" class="paragraph-item">
        <div class="paragraph-item-header">
          <strong>{{ schema.itemLabel }} {{ i + 1 }}</strong>
          <span class="spacer"></span>
          <button class="btn-outline btn" type="button" @click="moveItem(i, -1)">↑</button>
          <button class="btn-outline btn" type="button" @click="moveItem(i, 1)">↓</button>
          <button class="btn" type="button" style="background: #b03a3a" @click="removeItem(i)">
            ×
          </button>
        </div>
        <label v-for="f in schema.fields" :key="f.key" class="field">
          <span>{{ f.label }}</span>
          <textarea
            v-if="f.textarea"
            rows="2"
            :value="(item[f.key] as string | undefined) ?? ''"
            @input="(e) => updateItemField(i, f.key, (e.target as HTMLTextAreaElement).value)"
          ></textarea>
          <input
            v-else
            type="text"
            class="input"
            :value="(item[f.key] as string | undefined) ?? ''"
            @input="(e) => updateItemField(i, f.key, (e.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <button class="btn-outline btn" type="button" @click="addItem">
        {{ schema.addLabel ?? 'Ajouter' }}
      </button>
    </div>
  </div>
  <div v-else class="alert alert-warning">Type de paragraph inconnu : {{ code }}</div>
</template>

<style scoped>
.paragraph-editor {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: white;
}
.paragraph-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.paragraph-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.paragraph-item {
  border-left: 3px solid #000091;
  padding: 0.5rem 0.75rem;
  background: #fafafa;
  margin-bottom: 0.5rem;
}
.paragraph-item-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.25rem;
}
.spacer {
  flex: 1;
}
</style>
