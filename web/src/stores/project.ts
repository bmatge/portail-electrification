// `useProjectStore` — projet courant. Chargé par le `ProjectLayout` au
// changement de slug. Sert de source de vérité pour `is_public`, et de
// helper pour le toggle de visibilité.

import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as projectsApi from '../api/projects.api.js';
import type { ProjectDetail } from '../api/projects.api.js';

export const useProjectStore = defineStore('project', () => {
  const project = ref<ProjectDetail | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(slug: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      project.value = await projectsApi.getProject(slug);
    } catch (e) {
      error.value = (e as Error).message;
      project.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function setVisibility(isPublic: boolean): Promise<void> {
    if (!project.value) return;
    project.value = await projectsApi.setProjectVisibility(project.value.slug, isPublic);
  }

  function clear(): void {
    project.value = null;
    error.value = null;
  }

  return { project, loading, error, load, setVisibility, clear };
});
