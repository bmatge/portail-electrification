<script setup lang="ts">
// Page Objectifs : pyramide stratégique à 3 niveaux (axes → objectifs →
// moyens). CRUD complet : ajouter, renommer, supprimer, réordonner.
//
// La structure data attendue côté serveur :
//   { axes: [{ id, name, description, objectives: [{ id, name, means: [{ id, text, nodes: [] }] }] }] }
// Cohérent avec le seed corrigé Phase 3c (createProject + import fallback).

import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useObjectifsStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useSandboxStore } from '../stores/sandbox.js';

const route = useRoute();
const slug = computed(() => String(route.params['slug'] ?? ''));
const store = useObjectifsStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();

interface Mean {
  id: string;
  text: string;
  nodes?: string[];
  dispositifs?: string[];
}
interface Objective {
  id: string;
  name: string;
  means: Mean[];
}
interface Axe {
  id: string;
  name: string;
  description?: string;
  objectives: Objective[];
}
interface ObjectifsData {
  meta?: Record<string, unknown>;
  axes: Axe[];
}

function newId(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}

onMounted(async () => {
  if (slug.value) await store.hydrate(slug.value);
});

watch(slug, async (s) => {
  if (s) await store.hydrate(s);
});

const canEdit = computed(() => {
  if (auth.can('data:write')) return true;
  return sandbox.isActive(slug.value);
});

const data = computed<ObjectifsData>(() => {
  const raw = store.data as ObjectifsData | null;
  if (raw && Array.isArray(raw.axes)) return raw;
  return { axes: [] };
});

function ensureEditOrModal(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

async function commit(next: ObjectifsData): Promise<void> {
  store.setData(next);
  await store.save();
}

function clone(): ObjectifsData {
  return JSON.parse(JSON.stringify(data.value)) as ObjectifsData;
}

function addAxe(): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  next.axes.push({ id: newId('a'), name: 'Nouvel axe', description: '', objectives: [] });
  void commit(next);
}

function renameAxe(i: number, name: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const axe = next.axes[i];
  if (!axe) return;
  axe.name = name;
  void commit(next);
}

function moveAxe(i: number, dir: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const j = i + dir;
  if (j < 0 || j >= next.axes.length) return;
  const a = next.axes[i];
  const b = next.axes[j];
  if (!a || !b) return;
  next.axes[i] = b;
  next.axes[j] = a;
  void commit(next);
}

function removeAxe(i: number): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const axe = next.axes[i];
  if (!axe) return;
  const objCount = axe.objectives.length;
  const meanCount = axe.objectives.reduce((s, o) => s + o.means.length, 0);
  let msg = `Supprimer l'axe « ${axe.name} » ?`;
  if (objCount || meanCount)
    msg += `\n\n${objCount} objectif(s) et ${meanCount} moyen(s) seront aussi supprimés.`;
  if (!confirm(msg)) return;
  next.axes.splice(i, 1);
  void commit(next);
}

function addObjective(axeI: number): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const axe = next.axes[axeI];
  if (!axe) return;
  axe.objectives.push({ id: newId('o'), name: 'Nouvel objectif', means: [] });
  void commit(next);
}

function renameObjective(axeI: number, i: number, name: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const obj = next.axes[axeI]?.objectives[i];
  if (!obj) return;
  obj.name = name;
  void commit(next);
}

function moveObjective(axeI: number, i: number, dir: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const arr = next.axes[axeI]?.objectives;
  if (!arr) return;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  const a = arr[i];
  const b = arr[j];
  if (!a || !b) return;
  arr[i] = b;
  arr[j] = a;
  void commit(next);
}

function removeObjective(axeI: number, i: number): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const arr = next.axes[axeI]?.objectives;
  if (!arr) return;
  const obj = arr[i];
  if (!obj) return;
  let msg = `Supprimer l'objectif « ${obj.name} » ?`;
  if (obj.means.length) msg += `\n\n${obj.means.length} moyen(s) seront aussi supprimés.`;
  if (!confirm(msg)) return;
  arr.splice(i, 1);
  void commit(next);
}

function addMean(axeI: number, objI: number): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const obj = next.axes[axeI]?.objectives[objI];
  if (!obj) return;
  obj.means.push({ id: newId('m'), text: 'Nouveau moyen', nodes: [], dispositifs: [] });
  void commit(next);
}

function renameMean(axeI: number, objI: number, i: number, text: string): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const m = next.axes[axeI]?.objectives[objI]?.means[i];
  if (!m) return;
  m.text = text;
  void commit(next);
}

function removeMean(axeI: number, objI: number, i: number): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const arr = next.axes[axeI]?.objectives[objI]?.means;
  if (!arr) return;
  if (!confirm('Supprimer ce moyen ?')) return;
  arr.splice(i, 1);
  void commit(next);
}

function moveMean(axeI: number, objI: number, i: number, dir: -1 | 1): void {
  if (!ensureEditOrModal()) return;
  const next = clone();
  const arr = next.axes[axeI]?.objectives[objI]?.means;
  if (!arr) return;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  const a = arr[i];
  const b = arr[j];
  if (!a || !b) return;
  arr[i] = b;
  arr[j] = a;
  void commit(next);
}

function clearAll(): void {
  if (!ensureEditOrModal()) return;
  if (!confirm('Vider toute la pyramide ?')) return;
  void commit({ axes: [] });
}
</script>

<template>
  <div v-if="store.loading">Chargement…</div>
  <div v-else>
    <div class="toolbar">
      <button class="btn" type="button" @click="addAxe">+ Ajouter un axe</button>
      <span class="spacer"></span>
      <button v-if="data.axes.length" class="btn-outline btn" type="button" @click="clearAll">
        Vider la pyramide
      </button>
    </div>
    <p
      v-if="store.persistTarget === 'local' && store.localSavedAt"
      class="alert alert-info"
      style="font-size: 0.85rem"
    >
      Modifications locales sauvegardées (bac à sable).
    </p>
    <p v-if="data.axes.length === 0" style="color: #888; padding: 1rem">
      Pyramide vide. Commencez par ajouter un axe stratégique.
    </p>

    <div v-for="(axe, ai) in data.axes" :key="axe.id" class="axe-card l-card">
      <div class="axe-header">
        <input
          type="text"
          class="input axe-name"
          :value="axe.name"
          @change="(e) => renameAxe(ai, (e.target as HTMLInputElement).value)"
        />
        <div class="row-actions">
          <button class="btn-outline btn" type="button" @click="moveAxe(ai, -1)">↑</button>
          <button class="btn-outline btn" type="button" @click="moveAxe(ai, 1)">↓</button>
          <button class="btn vocab-del" type="button" @click="removeAxe(ai)">×</button>
        </div>
      </div>
      <div v-for="(obj, oi) in axe.objectives" :key="obj.id" class="obj-row">
        <input
          type="text"
          class="input obj-name"
          :value="obj.name"
          @change="(e) => renameObjective(ai, oi, (e.target as HTMLInputElement).value)"
        />
        <div class="row-actions">
          <button class="btn-outline btn" type="button" @click="moveObjective(ai, oi, -1)">
            ↑
          </button>
          <button class="btn-outline btn" type="button" @click="moveObjective(ai, oi, 1)">↓</button>
          <button class="btn vocab-del" type="button" @click="removeObjective(ai, oi)">×</button>
        </div>
        <ul class="means-list">
          <li v-for="(m, mi) in obj.means" :key="m.id" class="mean-row">
            <input
              type="text"
              class="input"
              :value="m.text"
              style="flex: 1"
              @change="(e) => renameMean(ai, oi, mi, (e.target as HTMLInputElement).value)"
            />
            <button class="btn-outline btn" type="button" @click="moveMean(ai, oi, mi, -1)">
              ↑
            </button>
            <button class="btn-outline btn" type="button" @click="moveMean(ai, oi, mi, 1)">
              ↓
            </button>
            <button class="btn vocab-del" type="button" @click="removeMean(ai, oi, mi)">×</button>
          </li>
        </ul>
        <button class="btn-outline btn" type="button" @click="addMean(ai, oi)">+ Moyen</button>
      </div>
      <button class="btn-outline btn" type="button" @click="addObjective(ai)">+ Objectif</button>
    </div>
  </div>
</template>

<style scoped>
.axe-card {
  padding: 1rem;
}
.axe-header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}
.axe-name {
  flex: 1;
  font-size: 1.05rem;
  font-weight: 600;
}
.obj-row {
  border-left: 3px solid #000091;
  padding-left: 0.75rem;
  margin: 0.5rem 0 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.obj-row > .row-actions {
  align-self: flex-end;
}
.obj-name {
  flex: 1;
  font-weight: 500;
}
.means-list {
  list-style: none;
  padding: 0;
  margin: 0.25rem 0;
}
.mean-row {
  display: flex;
  gap: 0.5rem;
  margin: 0.25rem 0;
  align-items: center;
}
.row-actions {
  display: flex;
  gap: 0.25rem;
}
.vocab-del {
  background: #b03a3a;
}
</style>
