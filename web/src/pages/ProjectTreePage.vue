<script setup lang="ts">
// Éditeur tree minimal : affiche le JSON brut de l'arbre + permet sauvegarde
// avec optimistic locking. Le port complet (drag/drop + détail nœuds + 17
// composants maquette) est documenté dans le todo Phase 6 du vault Obsidian.

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getTree, saveTree, type TreeHead } from '../api/tree.api.js';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const auth = useAuthStore();
const slug = computed(() => String(route.params['slug'] ?? ''));
const head = ref<TreeHead | null>(null);
const editing = ref('');
const status = ref<'idle' | 'saving' | 'conflict' | 'error' | 'ok'>('idle');
const errorMsg = ref<string | null>(null);

async function refresh(): Promise<void> {
  head.value = await getTree(slug.value);
  editing.value = JSON.stringify(head.value.tree, null, 2);
  status.value = 'idle';
  errorMsg.value = null;
}

async function save(): Promise<void> {
  if (!head.value) return;
  status.value = 'saving';
  errorMsg.value = null;
  try {
    const next = JSON.parse(editing.value);
    const result = await saveTree(slug.value, next, head.value.revision.id);
    status.value = 'ok';
    head.value = { revision: result.revision, tree: next };
  } catch (err) {
    const e = err as { response?: { status?: number; data?: { error?: string; head?: unknown } } };
    if (e.response?.status === 409) {
      status.value = 'conflict';
      errorMsg.value = 'Conflit : un autre éditeur a sauvegardé entre-temps. Recharge.';
    } else {
      status.value = 'error';
      errorMsg.value = (err as Error).message;
    }
  }
}

onMounted(refresh);
</script>

<template>
  <section v-if="head" class="l-card">
    <p>
      Révision tête #{{ head.revision.id }} par
      <strong>{{ head.revision.author.name }}</strong>
      ({{ head.revision.created_at }})
    </p>
    <p v-if="!auth.can('tree:write', null)" class="alert">
      Mode lecture seule : tu n'as pas la permission <code>tree:write</code> sur ce projet.
    </p>
    <textarea
      v-model="editing"
      rows="24"
      style="width: 100%; font-family: monospace; font-size: 0.85rem"
    ></textarea>
    <p style="display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem">
      <button class="btn" :disabled="!auth.can('tree:write', null)" @click="save">
        Sauvegarder
      </button>
      <button class="btn btn-outline" @click="refresh">Recharger</button>
      <span v-if="status === 'ok'" style="color: #18753c">✓ Sauvegardé</span>
      <span v-else-if="status === 'saving'">Sauvegarde…</span>
      <span v-else-if="errorMsg" class="alert alert-error" style="margin: 0">{{ errorMsg }}</span>
    </p>
    <details style="margin-top: 1rem">
      <summary>À propos de cet éditeur</summary>
      <p style="font-size: 0.9rem; color: #555">
        Cet éditeur Phase 6 est volontairement minimal : il manipule le JSON brut de l'arbre.
        L'éditeur visuel complet (drag/drop, panneau détail, 17 schémas DSFR de la maquette) reste à
        porter depuis <code>assets/script.js</code> et <code>assets/maquette.js</code> — cf. plan de
        refacto v2, Phase 6.
      </p>
    </details>
  </section>
  <p v-else>Chargement…</p>
</template>
