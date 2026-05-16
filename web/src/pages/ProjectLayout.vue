<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useProjectStore } from '../stores/project.js';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const projectStore = useProjectStore();
const auth = useAuthStore();
const slug = computed(() => String(route.params['slug'] ?? ''));

onMounted(() => {
  if (slug.value) void projectStore.load(slug.value);
});
watch(slug, (s) => {
  if (s) void projectStore.load(s);
});

const tabs = [
  { name: 'project-tree', label: 'Arborescence' },
  { name: 'project-roadmap', label: 'Roadmap' },
  { name: 'project-data', label: 'Modèle de données' },
  { name: 'project-objectifs', label: 'Objectifs' },
  { name: 'project-maquette', label: 'Maquette' },
  { name: 'project-history', label: 'Historique' },
] as const;

const canUpdate = computed(() => auth.can('project:update', projectStore.project?.id ?? null));

async function toggleVisibility(): Promise<void> {
  if (!projectStore.project) return;
  await projectStore.setVisibility(!projectStore.project.is_public);
}
</script>

<template>
  <div>
    <div class="fr-grid-row fr-grid-row--middle" style="gap: 0.75rem; margin-bottom: 0.5rem">
      <h1 style="margin: 0 0 0; font-size: 1.5rem">
        {{ projectStore.project?.name ?? slug }}
      </h1>
      <span
        v-if="projectStore.project"
        class="badge"
        :class="projectStore.project.is_public ? 'badge-public' : 'badge-private'"
      >
        {{ projectStore.project.is_public ? '🌐 Public' : '🔒 Privé' }}
      </span>
      <button
        v-if="projectStore.project && canUpdate"
        class="fr-btn fr-btn--secondary fr-btn--sm"
        @click="toggleVisibility"
      >
        Basculer en {{ projectStore.project.is_public ? 'privé' : 'public' }}
      </button>
    </div>
    <p v-if="projectStore.project?.description" style="color: #555; margin-top: 0">
      {{ projectStore.project.description }}
    </p>
    <p v-if="projectStore.error" class="alert alert-error">
      Erreur de chargement : {{ projectStore.error }}
    </p>
    <nav class="tabs">
      <RouterLink v-for="t in tabs" :key="t.name" :to="{ name: t.name, params: { slug } }">
        {{ t.label }}
      </RouterLink>
    </nav>
    <RouterView />
  </div>
</template>
