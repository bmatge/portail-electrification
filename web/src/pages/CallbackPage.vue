<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const error = ref<string | null>(null);
const status = ref<'loading' | 'ok' | 'failed'>('loading');

onMounted(async () => {
  const token = String(route.query['token'] ?? '');
  if (!token) {
    status.value = 'failed';
    error.value = 'Lien invalide.';
    return;
  }
  try {
    await auth.consumeCallback(token);
    status.value = 'ok';
    await router.replace('/');
  } catch {
    status.value = 'failed';
    error.value = 'Lien invalide ou expiré. Demande-en un nouveau.';
  }
});
</script>

<template>
  <div class="l-card">
    <p v-if="status === 'loading'">Connexion en cours…</p>
    <p v-else-if="status === 'failed'" class="alert alert-error">{{ error }}</p>
    <p v-else class="alert alert-info">Connecté. Redirection…</p>
  </div>
</template>
