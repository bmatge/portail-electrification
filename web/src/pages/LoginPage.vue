<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import PageHeader from '../components/ui/PageHeader.vue';

const email = ref('');
const sent = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const auth = useAuthStore();

async function submit(): Promise<void> {
  error.value = null;
  submitting.value = true;
  try {
    await auth.requestLogin(email.value);
    sent.value = true;
  } catch {
    error.value = 'Impossible de demander le lien magique. Réessaie dans une minute.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="l-container--narrow" style="max-width: 480px; margin: 2rem auto">
    <PageHeader
      title="Connexion"
      subtitle="Indiquez votre adresse email. Un lien magique vous sera envoyé pour vous connecter sans mot de passe — il expire après 15 minutes."
    />
    <div class="panel-card">
      <form v-if="!sent" @submit.prevent="submit">
        <label class="field">
          <span>Adresse email</span>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="fr-input"
            placeholder="prenom.nom@example.fr"
            :disabled="submitting"
          />
        </label>
        <p v-if="error" class="alert alert-error">{{ error }}</p>
        <p style="margin-top: 1rem">
          <button
            class="fr-btn fr-icon-mail-line fr-btn--icon-left"
            type="submit"
            :disabled="submitting"
          >
            {{ submitting ? 'Envoi…' : 'Recevoir le lien' }}
          </button>
        </p>
      </form>
      <div v-else class="alert alert-success">
        <strong>📬 Lien envoyé.</strong> Si un compte existe pour <code>{{ email }}</code
        >, un email vient d'être envoyé. Vérifiez votre boîte (et les spams).
      </div>
    </div>
    <p style="margin-top: 1.5rem; font-size: 0.9rem; color: #666">
      Pas encore de compte ? Le lien magique le créera automatiquement avec le rôle
      <strong>viewer</strong> (consultation des projets publics).
      <RouterLink to="/">Retour à la liste des projets</RouterLink>.
    </p>
  </div>
</template>
