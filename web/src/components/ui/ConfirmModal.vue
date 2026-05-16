<script setup lang="ts">
// Modal de confirmation globale — pilotée par le store `useConfirm`.
// Monté une seule fois dans App.vue. Toute partie de l'app peut demander
// une confirmation via `useConfirm().ask({ ... })`.

import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useConfirm } from '../../stores/confirm.js';

const store = useConfirm();
const opts = computed(() => store.current);

function onKey(e: KeyboardEvent): void {
  if (!opts.value) return;
  if (e.key === 'Escape') {
    store.cancel();
  } else if (e.key === 'Enter') {
    store.confirm();
  }
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="opts"
      class="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      @click.self="store.cancel"
    >
      <div class="confirm-modal" :class="{ 'confirm-modal--danger': opts.danger }">
        <header class="confirm-modal__head">
          <h2 class="confirm-modal__title">{{ opts.title }}</h2>
        </header>
        <p v-if="opts.message" class="confirm-modal__message">{{ opts.message }}</p>
        <footer class="confirm-modal__actions">
          <button type="button" class="fr-btn fr-btn--secondary" @click="store.cancel">
            {{ opts.cancelLabel ?? 'Annuler' }}
          </button>
          <button
            type="button"
            class="fr-btn"
            :class="opts.danger ? 'confirm-modal__danger-btn' : ''"
            @click="store.confirm"
          >
            {{ opts.confirmLabel ?? 'Confirmer' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(22, 22, 22, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  animation: fade-in 0.12s ease-out;
}
.confirm-modal {
  background: white;
  border-radius: 6px;
  max-width: 480px;
  width: 100%;
  padding: 1.5rem 1.75rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  animation: pop-in 0.15s ease-out;
}
.confirm-modal__head {
  margin-bottom: 0.5rem;
}
.confirm-modal__title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-title-grey, #161616);
}
.confirm-modal--danger .confirm-modal__title {
  color: var(--text-default-error, #ce0500);
}
.confirm-modal__message {
  margin: 0 0 1.25rem;
  color: var(--text-default-grey, #444);
  white-space: pre-line;
}
.confirm-modal__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.confirm-modal__danger-btn {
  background-color: var(--background-action-high-error, #ce0500);
  --hover: #a30400;
  --active: #8a0300;
}
.confirm-modal__danger-btn:hover {
  background-color: #a30400;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes pop-in {
  from {
    transform: scale(0.96);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
