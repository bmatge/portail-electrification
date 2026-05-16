<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getRoadmap, saveRoadmap } from '../api/tree.api.js';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const auth = useAuthStore();
const slug = computed(() => String(route.params['slug'] ?? ''));
const head = ref<{ revision: { id: number; created_at: string }; roadmap: unknown } | null>(null);
const editing = ref('');
const status = ref<'idle' | 'saving' | 'conflict' | 'error' | 'ok'>('idle');
const errorMsg = ref<string | null>(null);

async function refresh(): Promise<void> {
  const r = await getRoadmap(slug.value);
  head.value = {
    revision: { id: r.revision.id, created_at: r.revision.created_at },
    roadmap: r.roadmap,
  };
  editing.value = JSON.stringify(r.roadmap, null, 2);
  status.value = 'idle';
}

async function save(): Promise<void> {
  if (!head.value) return;
  status.value = 'saving';
  try {
    const next = JSON.parse(editing.value);
    const res = await saveRoadmap(slug.value, next, head.value.revision.id);
    head.value = {
      revision: { id: res.revision.id, created_at: res.revision.created_at },
      roadmap: next,
    };
    status.value = 'ok';
  } catch (err) {
    const e = err as { response?: { status?: number } };
    if (e.response?.status === 409) {
      status.value = 'conflict';
      errorMsg.value = 'Conflit (recharge).';
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
    <p>Révision tête #{{ head.revision.id }} ({{ head.revision.created_at }})</p>
    <textarea
      v-model="editing"
      rows="20"
      style="width: 100%; font-family: monospace; font-size: 0.85rem"
    ></textarea>
    <p style="display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem">
      <button class="btn" :disabled="!auth.can('roadmap:write', null)" @click="save">
        Sauvegarder
      </button>
      <button class="btn btn-outline" @click="refresh">Recharger</button>
      <span v-if="status === 'ok'" style="color: #18753c">✓ Sauvegardé</span>
      <span v-else-if="errorMsg" class="alert alert-error" style="margin: 0">{{ errorMsg }}</span>
    </p>
  </section>
  <p v-else>Chargement…</p>
</template>
