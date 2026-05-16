<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));

const tabs = [
  { name: 'project-tree', label: 'Arborescence' },
  { name: 'project-roadmap', label: 'Roadmap' },
  { name: 'project-data', label: 'Modèle de données' },
  { name: 'project-maquette', label: 'Maquette' },
] as const;
</script>

<template>
  <div>
    <h1>{{ slug }}</h1>
    <nav style="display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid #ddd">
      <RouterLink
        v-for="t in tabs"
        :key="t.name"
        :to="{ name: t.name, params: { slug } }"
        style="padding: 0.5rem 1rem; text-decoration: none"
      >
        {{ t.label }}
      </RouterLink>
    </nav>
    <RouterView />
  </div>
</template>
