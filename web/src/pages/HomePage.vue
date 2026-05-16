<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { listProjects, createProject, type ProjectListItem } from '../api/projects.api.js';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const projects = ref<readonly ProjectListItem[]>([]);
const loading = ref(true);
const newSlug = ref('');
const newName = ref('');
const createError = ref<string | null>(null);

async function refresh(): Promise<void> {
  loading.value = true;
  projects.value = await listProjects();
  loading.value = false;
}

async function handleCreate(): Promise<void> {
  createError.value = null;
  try {
    await createProject({ slug: newSlug.value, name: newName.value });
    newSlug.value = '';
    newName.value = '';
    await refresh();
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    createError.value = e.response?.data?.detail || e.response?.data?.error || 'Erreur';
  }
}

onMounted(refresh);
</script>

<template>
  <div>
    <h1>Projets</h1>
    <p v-if="loading">Chargement…</p>
    <ul v-else>
      <li v-for="p in projects" :key="p.id">
        <RouterLink :to="`/p/${p.slug}/arborescence`">
          <strong>{{ p.name }}</strong>
        </RouterLink>
        <small style="color: #666"> ({{ p.slug }}) — {{ p.revision_count }} révision(s)</small>
      </li>
    </ul>

    <div v-if="auth.can('project:create')" class="l-card">
      <h2>Nouveau projet</h2>
      <form @submit.prevent="handleCreate" style="display: grid; gap: 0.5rem; max-width: 480px">
        <label>
          Slug (a-z, 0-9, tirets)
          <input
            v-model="newSlug"
            type="text"
            required
            pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
          />
        </label>
        <label>
          Nom
          <input v-model="newName" type="text" required />
        </label>
        <p v-if="createError" class="alert alert-error">{{ createError }}</p>
        <p>
          <button class="btn" type="submit">Créer</button>
        </p>
      </form>
    </div>
    <p v-else class="alert">
      Tu es viewer : tu peux consulter les projets mais pas en créer. Demande à un admin
      l'attribution d'un rôle editor pour pouvoir contribuer.
    </p>
  </div>
</template>
