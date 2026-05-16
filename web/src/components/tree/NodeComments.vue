<script setup lang="ts">
// Liste + création + suppression (own) des commentaires sur un nœud.
// Affiché dans le panneau détail du tree.

import { computed, ref, watch } from 'vue';
import {
  listComments,
  createComment,
  deleteComment,
  type Comment,
} from '../../api/comments.api.js';
import { useAuthStore } from '../../stores/auth.js';

const props = defineProps<{
  slug: string;
  nodeId: string;
}>();

const auth = useAuthStore();
const comments = ref<readonly Comment[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const draft = ref('');
const sending = ref(false);

async function load(): Promise<void> {
  if (!props.slug || !props.nodeId) return;
  loading.value = true;
  error.value = null;
  try {
    comments.value = await listComments(props.slug, props.nodeId);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(() => [props.slug, props.nodeId], load, { immediate: true });

const canCreate = computed(() => auth.can('comments:create'));

async function submit(): Promise<void> {
  const body = draft.value.trim();
  if (!body || !canCreate.value || sending.value) return;
  sending.value = true;
  try {
    await createComment(props.slug, props.nodeId, body);
    draft.value = '';
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    sending.value = false;
  }
}

async function remove(c: Comment): Promise<void> {
  try {
    await deleteComment(props.slug, c.id);
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function isOwn(c: Comment): boolean {
  return !!auth.user && auth.user.id === c.author_id;
}

function canDelete(c: Comment): boolean {
  return isOwn(c) || auth.can('comments:delete:any');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
</script>

<template>
  <div>
    <p v-if="loading" style="color: #888; font-size: 0.85rem">Chargement…</p>
    <p v-else-if="error" class="alert alert-error" style="font-size: 0.85rem">{{ error }}</p>
    <p v-else-if="comments.length === 0" style="color: #888; font-size: 0.85rem; margin: 0">
      Aucun commentaire sur ce nœud.
    </p>

    <ul v-else style="list-style: none; padding: 0; margin: 0">
      <li v-for="c in comments" :key="c.id" class="comment">
        <div class="comment__head">
          <strong>{{ c.author_name }}</strong>
          <small style="color: #888">· {{ formatDate(c.created_at) }}</small>
          <span class="spacer"></span>
          <button
            v-if="canDelete(c)"
            class="fr-btn fr-btn--tertiary fr-btn--sm"
            style="color: #ce0500"
            @click="remove(c)"
          >
            ×
          </button>
        </div>
        <p class="comment__body">{{ c.body }}</p>
      </li>
    </ul>

    <form v-if="canCreate" @submit.prevent="submit" style="margin-top: 0.75rem">
      <textarea
        v-model="draft"
        rows="2"
        class="fr-input"
        placeholder="Écrire un commentaire…"
        :disabled="sending"
      ></textarea>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.4rem">
        <button class="fr-btn fr-btn--sm" type="submit" :disabled="!draft.trim() || sending">
          {{ sending ? 'Envoi…' : 'Publier' }}
        </button>
      </div>
    </form>
    <p v-else-if="!auth.user" style="color: #888; font-size: 0.85rem; margin-top: 0.5rem">
      Connectez-vous pour commenter.
    </p>
  </div>
</template>

<style scoped>
.comment {
  background: #fafafa;
  border-left: 3px solid #ddd;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.4rem;
  border-radius: 3px;
}
.comment__head {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.comment__body {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  white-space: pre-wrap;
}
.spacer {
  flex: 1;
}
</style>
