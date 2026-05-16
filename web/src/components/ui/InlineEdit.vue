<script setup lang="ts">
// `<InlineEdit>` — affichage texte cliquable qui devient input/textarea
// au clic. Pattern repris du legacy assets/objectifs.js `editableLabel()`.
//
// Comportement :
//   - Clic sur le texte → focus l'input avec valeur courante sélectionnée
//   - Enter ou blur → commit (emit 'update', value)
//   - Ctrl/Cmd+Enter en mode textarea → commit
//   - Escape → annule, restaure l'affichage
//   - Si canEdit=false → émet 'edit-attempt' au clic (utile pour le bac
//     à sable : l'anonyme clique, on lui propose la modal)
//
// Auto-resize horizontal pour les inputs (matches contenu).

import { computed, nextTick, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    value: string | null | undefined;
    placeholder?: string;
    textarea?: boolean;
    rows?: number;
    canEdit?: boolean;
    ariaLabel?: string;
    /** Classe sur le span d'affichage. */
    displayClass?: string;
    /** Classe sur l'input/textarea quand on édite. */
    inputClass?: string;
    /** Affiche le placeholder en italique gris si value vide. */
    placeholderItalic?: boolean;
  }>(),
  {
    canEdit: true,
    rows: 2,
    placeholder: '—',
    displayClass: '',
    inputClass: '',
    placeholderItalic: true,
    textarea: false,
  },
);

const emit = defineEmits<{
  (e: 'update', value: string): void;
  (e: 'edit-attempt'): void;
}>();

const editing = ref(false);
const draft = ref('');
const inputEl = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

const displayValue = computed(() => (props.value ?? '').toString());
const isEmpty = computed(() => !displayValue.value.trim());

watch(
  () => props.value,
  (v) => {
    if (!editing.value) draft.value = (v ?? '').toString();
  },
  { immediate: true },
);

async function startEdit(): Promise<void> {
  if (!props.canEdit) {
    emit('edit-attempt');
    return;
  }
  draft.value = displayValue.value;
  editing.value = true;
  await nextTick();
  inputEl.value?.focus();
  if (inputEl.value && 'select' in inputEl.value) {
    (inputEl.value as HTMLInputElement).select();
  }
}

function commit(): void {
  if (!editing.value) return;
  const next = draft.value.trim();
  editing.value = false;
  if (next !== displayValue.value.trim()) {
    emit('update', next);
  }
}

function cancel(): void {
  draft.value = displayValue.value;
  editing.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !props.textarea) {
    e.preventDefault();
    commit();
  } else if (e.key === 'Enter' && props.textarea && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    commit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  }
}
</script>

<template>
  <span class="inline-edit" :class="{ editing }">
    <template v-if="!editing">
      <span
        :class="[displayClass, 'inline-edit__display', { empty: isEmpty && placeholderItalic }]"
        :title="canEdit ? 'Cliquer pour modifier' : undefined"
        :tabindex="canEdit ? 0 : -1"
        :aria-label="ariaLabel ?? 'Modifier'"
        role="button"
        @click="startEdit"
        @keydown.enter.prevent="startEdit"
      >
        {{ isEmpty ? placeholder : displayValue }}
      </span>
    </template>
    <template v-else>
      <textarea
        v-if="textarea"
        ref="inputEl"
        v-model="draft"
        :class="[inputClass, 'fr-input inline-edit__input']"
        :rows="rows"
        :aria-label="ariaLabel"
        @blur="commit"
        @keydown="onKeydown"
      ></textarea>
      <input
        v-else
        ref="inputEl"
        v-model="draft"
        type="text"
        :class="[inputClass, 'fr-input inline-edit__input']"
        :aria-label="ariaLabel"
        @blur="commit"
        @keydown="onKeydown"
      />
    </template>
  </span>
</template>

<style scoped>
.inline-edit {
  display: inline-block;
  min-width: 2rem;
}
.inline-edit__display {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s;
}
.inline-edit__display:hover {
  background: #f3f3ff;
  border-color: #ccc;
}
.inline-edit__display:focus {
  outline: 2px solid #000091;
  outline-offset: 1px;
}
.inline-edit__display.empty {
  color: #999;
  font-style: italic;
}
.inline-edit__input {
  display: inline-block;
  min-width: 12rem;
  padding: 0.1rem 0.4rem;
  font: inherit;
  border: 1px solid #000091;
  border-radius: 3px;
  outline: none;
  background: white;
}
textarea.inline-edit__input {
  display: block;
  width: 100%;
  font-family: inherit;
  font-size: inherit;
  resize: vertical;
}
</style>
