<script setup lang="ts">
// Historique des révisions tree pour un projet.
// - Liste des révisions avec auteur, date, message
// - Diff léger entre 2 révisions sélectionnées : nœuds ajoutés / supprimés
//   / modifiés. (Un diff textuel ligne-à-ligne reste reporté v1.1.)
// - Revert (exige `tree:revert`).

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  listHistory,
  revertToRevision,
  getRevision,
  type RevisionEntry,
} from '../api/history.api.js';
import { useAuthStore } from '../stores/auth.js';
import { useTreeStore, type TreeNode } from '../stores/tree.js';
import { useConfirm } from '../stores/confirm.js';
import PageHeader from '../components/ui/PageHeader.vue';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const auth = useAuthStore();
const treeStore = useTreeStore();
const confirmStore = useConfirm();

const entries = ref<readonly RevisionEntry[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const reverting = ref<number | null>(null);

const filterAuthor = ref('');
const compareA = ref<number | null>(null);
const compareB = ref<number | null>(null);
const diffResult = ref<{
  added: TreeNode[];
  removed: TreeNode[];
  changed: { id: string; label: string; changes: string[] }[];
} | null>(null);
const diffLoading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    entries.value = await listHistory(slug.value);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(slug, load);

const canRevert = computed(() => auth.can('tree:revert'));

const authors = computed(() => {
  const set = new Set<string>();
  for (const r of entries.value) set.add(r.author.name);
  return Array.from(set).sort();
});

const filteredEntries = computed(() => {
  if (!filterAuthor.value) return entries.value;
  return entries.value.filter((r) => r.author.name === filterAuthor.value);
});

async function doRevert(rev: RevisionEntry): Promise<void> {
  if (!canRevert.value) return;
  const ok = await confirmStore.ask({
    title: `Restaurer la révision #${rev.id} ?`,
    message: `« ${rev.message || '(sans message)'} »\n\nUne nouvelle révision sera créée pour tracer ce retour en arrière. Le contenu actuel ne sera pas perdu (il restera consultable dans l'historique).`,
    confirmLabel: 'Restaurer cette révision',
  });
  if (!ok) return;
  reverting.value = rev.id;
  try {
    await revertToRevision(slug.value, rev.id, `Revert vers révision #${rev.id}`);
    await treeStore.hydrate(slug.value);
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    reverting.value = null;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

// Diff structurel : on indexe les nœuds par id puis on calcule
// ajoutés / supprimés / changés (champs visibles : label, deadline,
// page_type, audiences, tldr).
interface NodeIndex {
  [id: string]: TreeNode;
}
function indexTree(tree: TreeNode): NodeIndex {
  const out: NodeIndex = {};
  function walk(n: TreeNode): void {
    out[n.id] = n;
    for (const c of n.children ?? []) walk(c);
  }
  walk(tree);
  return out;
}

const DIFF_FIELDS = ['label', 'deadline', 'page_type', 'tldr'] as const;

async function computeDiff(): Promise<void> {
  if (compareA.value == null || compareB.value == null) return;
  diffLoading.value = true;
  diffResult.value = null;
  try {
    const [a, b] = await Promise.all([
      getRevision(slug.value, compareA.value),
      getRevision(slug.value, compareB.value),
    ]);
    const ai = indexTree(a.tree as TreeNode);
    const bi = indexTree(b.tree as TreeNode);
    const added: TreeNode[] = [];
    const removed: TreeNode[] = [];
    const changed: { id: string; label: string; changes: string[] }[] = [];
    for (const id of Object.keys(bi)) {
      const before = ai[id];
      const after = bi[id]!;
      if (!before) {
        added.push(after);
      } else {
        const diffs: string[] = [];
        for (const f of DIFF_FIELDS) {
          if ((before[f] ?? '') !== (after[f] ?? '')) {
            diffs.push(`${f} : « ${String(before[f] ?? '')} » → « ${String(after[f] ?? '')} »`);
          }
        }
        const aChildIds = (before.children ?? []).map((c) => c.id).join(',');
        const bChildIds = (after.children ?? []).map((c) => c.id).join(',');
        if (aChildIds !== bChildIds) {
          diffs.push(`enfants réordonnés/modifiés`);
        }
        if (diffs.length) changed.push({ id, label: after.label, changes: diffs });
      }
    }
    for (const id of Object.keys(ai)) {
      if (!bi[id]) removed.push(ai[id]!);
    }
    diffResult.value = { added, removed, changed };
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    diffLoading.value = false;
  }
}

watch([compareA, compareB], () => {
  if (compareA.value != null && compareB.value != null && compareA.value !== compareB.value) {
    void computeDiff();
  } else {
    diffResult.value = null;
  }
});
</script>

<template>
  <div>
    <PageHeader
      title="Historique des révisions"
      subtitle="Toutes les modifications de l'arborescence sont enregistrées comme une nouvelle révision. Sélectionnez deux révisions pour comparer, ou cliquez sur « Revenir à cette version » pour restaurer."
    />

    <div class="toolbar">
      <select v-model="filterAuthor" class="fr-select fr-select--sm" style="max-width: 240px">
        <option value="">Tous les auteurs</option>
        <option v-for="a in authors" :key="a" :value="a">{{ a }}</option>
      </select>
      <span class="spacer"></span>
      <span style="font-size: 0.85rem; color: #555">
        {{ filteredEntries.length }} / {{ entries.length }} révision{{
          entries.length > 1 ? 's' : ''
        }}
      </span>
      <button
        class="fr-btn fr-btn--secondary fr-btn--sm fr-icon-refresh-line fr-btn--icon-left"
        @click="load"
      >
        Recharger
      </button>
    </div>

    <section v-if="entries.length > 1" class="panel-card">
      <h3 class="panel-card__title">Comparer deux révisions</h3>
      <div class="toolbar">
        <label class="field" style="flex: 1; max-width: 220px">
          <span>Avant (révision A)</span>
          <select v-model.number="compareA" class="fr-select fr-select--sm">
            <option :value="null">—</option>
            <option v-for="r in entries" :key="`a-${r.id}`" :value="r.id">
              #{{ r.id }} · {{ r.message.slice(0, 40) }}
            </option>
          </select>
        </label>
        <span style="padding-top: 1.5rem">→</span>
        <label class="field" style="flex: 1; max-width: 220px">
          <span>Après (révision B)</span>
          <select v-model.number="compareB" class="fr-select fr-select--sm">
            <option :value="null">—</option>
            <option v-for="r in entries" :key="`b-${r.id}`" :value="r.id">
              #{{ r.id }} · {{ r.message.slice(0, 40) }}
            </option>
          </select>
        </label>
      </div>
      <p v-if="diffLoading" style="color: #888">Calcul du diff…</p>
      <div v-else-if="diffResult" class="diff">
        <p
          v-if="
            diffResult.added.length === 0 &&
            diffResult.removed.length === 0 &&
            diffResult.changed.length === 0
          "
          class="alert alert-info"
        >
          Aucune différence détectée.
        </p>
        <template v-else>
          <div v-if="diffResult.added.length" class="diff-section diff-section--added">
            <h4>
              + {{ diffResult.added.length }} ajout{{ diffResult.added.length > 1 ? 's' : '' }}
            </h4>
            <ul>
              <li v-for="n in diffResult.added" :key="n.id">
                <code>{{ n.id }}</code> — {{ n.label }}
              </li>
            </ul>
          </div>
          <div v-if="diffResult.removed.length" class="diff-section diff-section--removed">
            <h4>
              − {{ diffResult.removed.length }} suppression{{
                diffResult.removed.length > 1 ? 's' : ''
              }}
            </h4>
            <ul>
              <li v-for="n in diffResult.removed" :key="n.id">
                <code>{{ n.id }}</code> — {{ n.label }}
              </li>
            </ul>
          </div>
          <div v-if="diffResult.changed.length" class="diff-section diff-section--changed">
            <h4>
              ~ {{ diffResult.changed.length }} modification{{
                diffResult.changed.length > 1 ? 's' : ''
              }}
            </h4>
            <ul>
              <li v-for="c in diffResult.changed" :key="c.id">
                <code>{{ c.id }}</code> — {{ c.label }}
                <ul>
                  <li v-for="(d, i) in c.changes" :key="i">{{ d }}</li>
                </ul>
              </li>
            </ul>
          </div>
        </template>
      </div>
    </section>

    <p v-if="loading" style="color: #888">Chargement…</p>
    <p v-else-if="error" class="alert alert-error">Erreur : {{ error }}</p>
    <p v-else-if="filteredEntries.length === 0" class="alert alert-info">
      Aucune révision à afficher.
    </p>

    <div v-else class="history-list">
      <div v-for="(rev, i) in filteredEntries" :key="rev.id" class="history-row panel-card">
        <div class="history-row__head">
          <span class="history-row__id">#{{ rev.id }}</span>
          <span
            v-if="i === 0 && !filterAuthor"
            class="badge badge-public"
            style="margin-left: 0.5rem"
            >tête</span
          >
          <span v-else-if="rev.reverts_id" class="badge" style="margin-left: 0.5rem">
            revert → #{{ rev.reverts_id }}
          </span>
          <span class="spacer"></span>
          <small style="color: #666">{{ formatDate(rev.created_at) }}</small>
        </div>
        <p class="history-row__message">{{ rev.message || '(sans message)' }}</p>
        <div class="history-row__foot">
          <small style="color: #666">
            par <strong>{{ rev.author.name }}</strong>
          </small>
          <span class="spacer"></span>
          <button
            class="fr-btn fr-btn--tertiary fr-btn--sm"
            @click="
              compareB = rev.id;
              compareA = entries[i + 1]?.id ?? null;
            "
          >
            Comparer à la précédente
          </button>
          <button
            v-if="canRevert && !(i === 0 && !filterAuthor)"
            class="fr-btn fr-btn--secondary fr-btn--sm fr-icon-history-line fr-btn--icon-left"
            :disabled="reverting === rev.id"
            @click="doRevert(rev)"
          >
            {{ reverting === rev.id ? 'Revert…' : 'Revenir à cette version' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.history-row {
  margin-bottom: 0;
  padding: 0.75rem 1rem;
}
.history-row__head {
  display: flex;
  align-items: center;
  margin-bottom: 0.3rem;
}
.history-row__id {
  font-family: ui-monospace, monospace;
  font-weight: 700;
  color: var(--text-action-high-blue-france, #000091);
}
.history-row__message {
  margin: 0.2rem 0;
}
.history-row__foot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.3rem;
}
.spacer {
  flex: 1;
}

.diff {
  background: #fafafa;
  border: 1px solid var(--border-default-grey, #ddd);
  border-radius: 4px;
  padding: 0.75rem 1rem;
}
.diff-section {
  margin-bottom: 0.75rem;
}
.diff-section:last-child {
  margin-bottom: 0;
}
.diff-section h4 {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  font-weight: 700;
}
.diff-section--added h4 {
  color: var(--text-default-success, #18753c);
}
.diff-section--removed h4 {
  color: var(--text-default-error, #ce0500);
}
.diff-section--changed h4 {
  color: var(--text-default-warning, #b88600);
}
.diff-section ul {
  margin: 0;
  padding-left: 1.2rem;
}
.diff-section code {
  font-size: 0.75rem;
  background: #f1f1f1;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
}
</style>
