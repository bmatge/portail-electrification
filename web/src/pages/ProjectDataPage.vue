<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getData, saveData } from '../api/tree.api.js';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const auth = useAuthStore();
const slug = computed(() => String(route.params['slug'] ?? ''));

const KEYS = ['vocab', 'drupal_structure', 'dispositifs', 'mesures', 'objectifs'] as const;
type Key = (typeof KEYS)[number];
const selectedKey = ref<Key>('vocab');
const editing = ref('');
const status = ref<'idle' | 'saving' | 'ok' | 'error'>('idle');
const errorMsg = ref<string | null>(null);

async function load(): Promise<void> {
  const { data } = await getData(slug.value, selectedKey.value);
  editing.value = JSON.stringify(data, null, 2);
  status.value = 'idle';
  errorMsg.value = null;
}

async function save(): Promise<void> {
  status.value = 'saving';
  try {
    await saveData(slug.value, selectedKey.value, JSON.parse(editing.value));
    status.value = 'ok';
  } catch (err) {
    status.value = 'error';
    errorMsg.value = (err as Error).message;
  }
}

onMounted(load);
watch(selectedKey, load);
</script>

<template>
  <section class="l-card">
    <p>
      Catalogue éditable :
      <select v-model="selectedKey">
        <option v-for="k in KEYS" :key="k" :value="k">{{ k }}</option>
      </select>
    </p>
    <p v-if="!auth.can('data:write', null)" class="alert">
      Lecture seule (manque <code>data:write</code>).
    </p>
    <textarea
      v-model="editing"
      rows="24"
      style="width: 100%; font-family: monospace; font-size: 0.85rem"
    ></textarea>
    <p style="display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem">
      <button class="btn" :disabled="!auth.can('data:write', null)" @click="save">
        Sauvegarder
      </button>
      <button class="btn btn-outline" @click="load">Recharger</button>
      <span v-if="status === 'ok'" style="color: #18753c">✓ Sauvegardé</span>
      <span v-else-if="errorMsg" class="alert alert-error" style="margin: 0">{{ errorMsg }}</span>
    </p>
  </section>
</template>
