// Store global pour les modals de confirmation. Une seule modal à la
// fois ; `confirm({ ... })` retourne une promesse boolean.
//
// Usage :
//   const ok = await useConfirm().ask({
//     title: 'Supprimer le projet ?',
//     message: 'Toutes ses données seront perdues.',
//     confirmLabel: 'Supprimer',
//     danger: true,
//   });
//   if (!ok) return;

import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true → bouton confirmation rouge (action destructive). */
  danger?: boolean;
}

export interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const useConfirm = defineStore('confirm', () => {
  const current = ref<ConfirmState | null>(null);

  function ask(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      current.value = { ...opts, resolve };
    });
  }

  function confirm(): void {
    if (current.value) {
      current.value.resolve(true);
      current.value = null;
    }
  }
  function cancel(): void {
    if (current.value) {
      current.value.resolve(false);
      current.value = null;
    }
  }

  return { current, ask, confirm, cancel };
});
