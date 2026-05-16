<script setup lang="ts">
// Placeholder Phase 6 — la maquette éditable avec ses 17 schémas DSFR
// (cf. assets/maquette.js v1, 1427 lignes) sera portée en composants
// Paragraph*.vue partagés via @latelier/shared/dsfr-paragraphs.ts dans
// une session ultérieure. Pour l'instant on lit l'arbre brut et on
// affiche la propriété `maquette` de chaque nœud quand elle existe.

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getTree } from '../api/tree.api.js';

interface NodeLike {
  readonly id?: string;
  readonly label?: string;
  readonly maquette?: unknown;
  readonly children?: readonly NodeLike[];
}

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const flat = ref<NodeLike[]>([]);

function walk(node: NodeLike, out: NodeLike[]): void {
  if (node.maquette) out.push(node);
  for (const c of node.children ?? []) walk(c, out);
}

async function load(): Promise<void> {
  const head = await getTree(slug.value);
  const out: NodeLike[] = [];
  walk(head.tree as NodeLike, out);
  flat.value = out;
}

onMounted(load);
</script>

<template>
  <section class="l-card">
    <p class="alert alert-info">
      Page maquette en mode scaffold. Affiche les nœuds qui ont déjà une clé
      <code>maquette</code> dans le JSON tree. L'éditeur complet 17 schémas DSFR sera porté en Phase
      6 (cf. plan).
    </p>
    <div v-for="n in flat" :key="n.id">
      <h3>{{ n.label }}</h3>
      <pre style="font-size: 0.8rem; background: #f6f6f6; padding: 0.75rem">{{
        JSON.stringify(n.maquette, null, 2)
      }}</pre>
    </div>
    <p v-if="flat.length === 0">Aucun nœud ne porte de maquette pour ce projet.</p>
  </section>
</template>
