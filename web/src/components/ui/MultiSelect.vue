<script setup lang="ts">
// MultiSelect DSFR-like : bouton "X options sélectionnées" qui déplie un
// menu avec champ de recherche + checkbox par option. Émet `update:selected`
// (v-model:selected compatible).
//
// Pattern visuel inspiré du `fr-select` multi-options (capture utilisateur) :
// trigger en bouton secondaire avec caret, dropdown blanc avec bouton
// "Tout désélectionner", input search, liste filtrée.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface Option {
  value: string;
  label: string;
  /** Détail secondaire (ex: id technique) affiché à côté du label. */
  meta?: string;
}

const props = defineProps<{
  options: readonly Option[];
  selected: readonly string[];
  /** Texte de l'état vide ("Choisir des publics", "Choisir des ressources"…). */
  placeholder?: string;
  /** Désactive complètement le composant. */
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:selected', next: string[]): void;
}>();

const open = ref(false);
const search = ref('');
const triggerRef = ref<HTMLButtonElement | null>(null);

function toggle(): void {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) search.value = '';
}
function close(): void {
  open.value = false;
}

function onDocumentClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (!target.closest('.multi-select')) close();
}
onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

const selectedSet = computed(() => new Set(props.selected));

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter(
    (o) => o.label.toLowerCase().includes(q) || (o.meta ?? '').toLowerCase().includes(q),
  );
});

const triggerLabel = computed(() => {
  const n = props.selected.length;
  if (n === 0) return props.placeholder ?? 'Aucune sélection';
  if (n === 1) return `1 option sélectionnée`;
  return `${n} options sélectionnées`;
});

function toggleOption(value: string, ev: Event): void {
  ev.stopPropagation();
  const current = selectedSet.value;
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  emit('update:selected', Array.from(next));
}

function clearAll(): void {
  emit('update:selected', []);
}
</script>

<template>
  <div class="multi-select" :class="{ 'is-open': open }">
    <button
      ref="triggerRef"
      type="button"
      class="multi-select__trigger fr-select"
      :class="{ 'multi-select__trigger--empty': selected.length === 0 }"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="disabled"
      @click.stop="toggle"
    >
      <span class="multi-select__trigger-label">{{ triggerLabel }}</span>
      <span class="multi-select__caret" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-if="open" class="multi-select__panel" role="listbox" @click.stop>
      <div class="multi-select__panel-head">
        <button
          type="button"
          class="fr-btn fr-btn--tertiary fr-btn--sm fr-icon-close-circle-line fr-btn--icon-left"
          :disabled="selected.length === 0"
          @click="clearAll"
        >
          Tout désélectionner
        </button>
      </div>
      <div class="multi-select__search">
        <input
          v-model="search"
          type="search"
          class="fr-input fr-input--sm"
          placeholder="🔍 Rechercher…"
          aria-label="Rechercher dans les options"
        />
      </div>
      <ul class="multi-select__options">
        <li v-if="filtered.length === 0" class="multi-select__empty">
          Aucune option ne correspond à votre recherche.
        </li>
        <li
          v-for="o in filtered"
          :key="o.value"
          class="multi-select__option"
          :class="{ 'is-checked': selectedSet.has(o.value) }"
        >
          <label class="multi-select__option-label">
            <input
              type="checkbox"
              class="multi-select__option-checkbox"
              :checked="selectedSet.has(o.value)"
              @change="(e) => toggleOption(o.value, e)"
            />
            <span class="multi-select__option-text">
              <span v-if="o.meta" class="multi-select__option-meta">{{ o.meta }}</span>
              <span>{{ o.label }}</span>
            </span>
          </label>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.multi-select {
  position: relative;
  width: 100%;
}
.multi-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  cursor: pointer;
  padding-right: 0.6rem;
  font: inherit;
  /* fr-select donne déjà bg/border/font-size */
}
.multi-select__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.multi-select__trigger--empty .multi-select__trigger-label {
  color: var(--text-mention-grey, #888);
  font-style: italic;
}
.multi-select__caret {
  margin-left: 0.5rem;
  font-size: 0.7rem;
  color: var(--text-mention-grey, #666);
}
.multi-select.is-open .multi-select__trigger {
  border-color: var(--text-action-high-blue-france, #000091);
  outline: 2px solid var(--text-action-high-blue-france, #000091);
  outline-offset: -2px;
}

.multi-select__panel {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 100;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
}
.multi-select__panel-head {
  padding: 0.5rem 0.6rem 0.3rem;
  border-bottom: 1px solid var(--border-default-grey, #eee);
}
.multi-select__search {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border-default-grey, #eee);
}
.multi-select__options {
  list-style: none;
  padding: 0.3rem 0;
  margin: 0;
  overflow-y: auto;
}
.multi-select__empty {
  padding: 0.6rem 0.8rem;
  color: var(--text-mention-grey, #888);
  font-style: italic;
  font-size: 0.85rem;
}
.multi-select__option {
  padding: 0;
}
.multi-select__option-label {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.multi-select__option-label:hover {
  background: var(--background-alt-blue-france, #f3f3ff);
}
.multi-select__option.is-checked .multi-select__option-label {
  background: var(--background-contrast-info, #eef0ff);
}
.multi-select__option-checkbox {
  margin-top: 0.15rem;
  flex-shrink: 0;
  accent-color: var(--text-action-high-blue-france, #000091);
}
.multi-select__option-text {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}
.multi-select__option-meta {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  color: var(--text-mention-grey, #888);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 600;
}
</style>
