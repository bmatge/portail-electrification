<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
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

const canUpdate = computed(() => auth.can('project:update', projectStore.project?.id ?? null));

async function toggleVisibility(): Promise<void> {
  if (!projectStore.project) return;
  await projectStore.setVisibility(!projectStore.project.is_public);
}
</script>

<template>
  <div>
    <div class="project-banner">
      <div class="project-banner__head">
        <h2 class="project-banner__name">
          {{ projectStore.project?.name ?? slug }}
        </h2>
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
      <p v-if="projectStore.project?.description" class="project-banner__desc">
        {{ projectStore.project.description }}
      </p>
    </div>
    <p v-if="projectStore.error" class="alert alert-error">
      Erreur de chargement : {{ projectStore.error }}
    </p>
    <RouterView />
  </div>
</template>

<style scoped>
.project-banner {
  margin-bottom: 1rem;
}
.project-banner__head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.project-banner__name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}
.project-banner__desc {
  margin: 0.3rem 0 0;
  color: var(--text-mention-grey, #555);
  font-size: 0.95rem;
}
</style>
