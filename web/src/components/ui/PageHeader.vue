<script setup lang="ts">
interface Props {
  title: string;
  subtitle?: string;
}
defineProps<Props>();
</script>

<template>
  <header class="page-header">
    <h1 class="fr-h3 page-header__title">{{ title }}</h1>
    <p v-if="subtitle" class="fr-text--lg page-header__subtitle">{{ subtitle }}</p>
    <slot name="toolbar" />
  </header>
</template>

<style scoped>
.page-header {
  margin-bottom: 1.25rem;
}
.page-header__title {
  margin: 0 0 0.25rem;
  color: var(--text-title-grey, #161616);
}
.page-header__subtitle {
  margin: 0;
  color: var(--text-mention-grey, #666);
}
</style>
