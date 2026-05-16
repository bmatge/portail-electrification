<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useSandboxStore } from './stores/sandbox.js';
import SandboxModal from './components/sandbox/SandboxModal.vue';
import SandboxBanner from './components/sandbox/SandboxBanner.vue';
import AppHeader from './components/AppHeader.vue';
import AppFooter from './components/AppFooter.vue';
import ConfirmModal from './components/ui/ConfirmModal.vue';

const auth = useAuthStore();
const sandbox = useSandboxStore();

onMounted(() => {
  void auth.fetchMe();
  void sandbox.hydrate();
});
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <SandboxBanner />
    <main class="fr-container l-container" role="main">
      <RouterView />
    </main>
    <AppFooter />
    <SandboxModal />
    <ConfirmModal />
  </div>
</template>
