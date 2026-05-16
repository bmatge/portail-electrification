<script setup lang="ts">
// Modal de bascule en mode bac à sable. Apparaît à la première tentative
// d'édition d'un anonyme.

import { useRoute, useRouter } from 'vue-router';
import { useSandboxStore } from '../../stores/sandbox.js';

const sandbox = useSandboxStore();
const router = useRouter();
const route = useRoute();

async function activateLocal(): Promise<void> {
  const slug = route.params['slug'];
  if (typeof slug === 'string') await sandbox.activate(slug);
  sandbox.closeModal();
}

function goLogin(): void {
  sandbox.closeModal();
  void router.push({ name: 'login', query: { next: route.fullPath } });
}
</script>

<template>
  <div v-if="sandbox.modal.visible" class="modal-backdrop" @click.self="sandbox.closeModal">
    <div class="modal" role="dialog" aria-modal="true">
      <h2>🔐 Vous n'êtes pas connecté</h2>
      <p>
        Pour modifier ce projet de manière persistante, connectez-vous. Sinon, vous pouvez tester
        des modifications en <strong>mode bac à sable</strong> : vos changements restent dans votre
        navigateur et n'impactent pas la version officielle.
      </p>
      <p style="font-size: 0.85rem; color: #555">
        Une fois en bac à sable, vous pourrez exporter votre brouillon en JSON pour le partager.
      </p>
      <div class="actions">
        <button class="fr-btn" type="button" @click="goLogin">Se connecter pour modifier</button>
        <button class="fr-btn fr-btn--secondary" type="button" @click="activateLocal">
          🧪 Tester en bac à sable (local)
        </button>
        <button
          class="fr-btn fr-btn--tertiary-no-outline"
          type="button"
          @click="sandbox.closeModal"
        >
          Annuler
        </button>
      </div>
    </div>
  </div>
</template>
