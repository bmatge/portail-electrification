<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';

const email = ref('');
const sent = ref(false);
const error = ref<string | null>(null);
const auth = useAuthStore();

async function submit(): Promise<void> {
  error.value = null;
  try {
    await auth.requestLogin(email.value);
    sent.value = true;
  } catch {
    error.value = 'Impossible de demander le lien magique. Réessaie dans une minute.';
  }
}
</script>

<template>
  <div class="l-card">
    <h1>Connexion</h1>
    <p>Indique ton email professionnel, on t'envoie un lien magique.</p>
    <form v-if="!sent" @submit.prevent="submit">
      <label for="email">Email</label>
      <input
        id="email"
        v-model="email"
        type="email"
        required
        autocomplete="email"
        placeholder="prenom.nom@…"
      />
      <p v-if="error" class="alert alert-error">{{ error }}</p>
      <p style="margin-top: 1rem">
        <button class="btn" type="submit">Recevoir le lien</button>
      </p>
    </form>
    <p v-else class="alert alert-info">
      Si l'email existe, un lien magique a été envoyé. Vérifie ta boîte (et tes spams).
    </p>
  </div>
</template>
