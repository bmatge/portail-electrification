<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useSandboxStore } from './stores/sandbox.js';
import SandboxModal from './components/sandbox/SandboxModal.vue';
import SandboxBanner from './components/sandbox/SandboxBanner.vue';
import UserMenu from './components/UserMenu.vue';

const auth = useAuthStore();
const sandbox = useSandboxStore();

onMounted(() => {
  void auth.fetchMe();
  void sandbox.hydrate();
});
</script>

<template>
  <div>
    <header class="app-header">
      <div class="app-header-inner">
        <RouterLink to="/" class="app-header-title">L'atelier 🪢</RouterLink>
        <nav class="app-header-nav" style="flex: 1">
          <RouterLink to="/">Projets</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin">Admin</RouterLink>
        </nav>
        <UserMenu v-if="auth.user" />
        <RouterLink v-else class="fr-btn fr-btn--sm" to="/login">Se connecter</RouterLink>
      </div>
    </header>
    <SandboxBanner />
    <main class="l-container">
      <RouterView />
    </main>
    <SandboxModal />
  </div>
</template>
