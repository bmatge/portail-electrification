<script setup lang="ts">
// Historique des révisions tree pour un projet. Liste paginée + bouton
// revert (exige `tree:revert`). Lecture seulement pour les autres.

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { listHistory, revertToRevision, type RevisionEntry } from '../api/history.api.js';
import { useAuthStore } from '../stores/auth.js';
import { useTreeStore } from '../stores/tree.js';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const auth = useAuthStore();
const treeStore = useTreeStore();

const entries = ref<readonly RevisionEntry[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const reverting = ref<number | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    entries.value = await listHistory(slug.value);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(slug, load);

const canRevert = computed(() => auth.can('tree:revert'));

async function doRevert(rev: RevisionEntry): Promise<void> {
  if (!canRevert.value) return;
  if (
    !confirm(
      `Restaurer l'arbre à la révision #${rev.id} (${rev.message}) ? Une nouvelle révision sera créée pour tracer le revert.`,
    )
  )
    return;
  reverting.value = rev.id;
  try {
    await revertToRevision(slug.value, rev.id, `Revert vers révision #${rev.id}`);
    await treeStore.hydrate(slug.value);
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    reverting.value = null;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}
</script>

<template>
  <div>
    <div class="toolbar">
      <h2 style="margin: 0; font-size: 1.2rem">Historique des révisions de l'arborescence</h2>
      <span class="spacer"></span>
      <span style="font-size: 0.85rem; color: #555">{{ entries.length }} révisions</span>
      <button class="fr-btn fr-btn--secondary fr-btn--sm" @click="load">↻ Recharger</button>
    </div>

    <p v-if="loading" style="color: #888">Chargement…</p>
    <p v-else-if="error" class="alert alert-error">Erreur : {{ error }}</p>
    <p v-else-if="entries.length === 0" style="color: #888; padding: 1rem">
      Aucune révision pour ce projet.
    </p>

    <div v-else class="history-list">
      <div v-for="(rev, i) in entries" :key="rev.id" class="history-row l-card">
        <div class="history-row__head">
          <span class="history-row__id">#{{ rev.id }}</span>
          <span v-if="i === 0" class="badge badge-public" style="margin-left: 0.5rem">tête</span>
          <span v-else-if="rev.reverts_id" class="badge" style="margin-left: 0.5rem"
            >revert → #{{ rev.reverts_id }}</span
          >
          <span class="spacer"></span>
          <small style="color: #666">{{ formatDate(rev.created_at) }}</small>
        </div>
        <p class="history-row__message">{{ rev.message || '(sans message)' }}</p>
        <div class="history-row__foot">
          <small style="color: #666"
            >par <strong>{{ rev.author.name }}</strong></small
          >
          <span class="spacer"></span>
          <button
            v-if="canRevert && i !== 0"
            class="fr-btn fr-btn--secondary fr-btn--sm"
            :disabled="reverting === rev.id"
            @click="doRevert(rev)"
          >
            {{ reverting === rev.id ? 'Revert…' : '↺ Revenir à cette version' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.history-row {
  margin-bottom: 0;
  padding: 0.75rem 1rem;
}
.history-row__head {
  display: flex;
  align-items: center;
  margin-bottom: 0.3rem;
}
.history-row__id {
  font-family: ui-monospace, monospace;
  font-weight: 700;
  color: #000091;
}
.history-row__message {
  margin: 0.2rem 0;
}
.history-row__foot {
  display: flex;
  align-items: center;
  margin-top: 0.3rem;
}
.spacer {
  flex: 1;
}
</style>
