<script setup lang="ts">
// Catalogue Mesures (politiques publiques) — UI complète vs JSON brut.

import { computed, ref } from 'vue';
import { useMesuresStore } from '../../stores/data.js';
import { useAuthStore } from '../../stores/auth.js';
import { useSandboxStore } from '../../stores/sandbox.js';
import InlineEdit from '../../components/ui/InlineEdit.vue';

const props = defineProps<{ slug: string }>();

const store = useMesuresStore();
const auth = useAuthStore();
const sandbox = useSandboxStore();

interface Mesure {
  id: string;
  label: string;
  description?: string;
  status?: string;
  pilote?: string;
  [k: string]: unknown;
}
interface MesuresData {
  meta?: Record<string, unknown>;
  mesures: Mesure[];
}

const canEdit = computed(() => {
  if (auth.can('data:write')) return true;
  return sandbox.isActive(props.slug);
});

const data = computed<MesuresData>(() => {
  const raw = store.data as MesuresData | null;
  if (raw && Array.isArray(raw.mesures)) return raw;
  return { mesures: [] };
});

const search = ref('');
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return data.value.mesures;
  return data.value.mesures.filter(
    (m) =>
      m.label.toLowerCase().includes(term) ||
      m.id.toLowerCase().includes(term) ||
      (m.description ?? '').toLowerCase().includes(term),
  );
});

function ensureEdit(): boolean {
  if (canEdit.value) return true;
  if (!auth.user) sandbox.openModal('edit');
  else alert("Vous n'avez pas la permission d'éditer.");
  return false;
}

async function commit(next: MesuresData): Promise<void> {
  store.setData(next);
  await store.save();
}

function clone(): MesuresData {
  return JSON.parse(JSON.stringify(data.value)) as MesuresData;
}

function nextMesureId(): string {
  const existing = new Set(data.value.mesures.map((m) => m.id));
  for (let i = 1; i < 1000; i++) {
    const candidate = `M${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return 'M-' + Math.random().toString(36).slice(2, 6);
}

function addMesure(): void {
  if (!ensureEdit()) return;
  const next = clone();
  next.mesures.push({
    id: nextMesureId(),
    label: 'Nouvelle mesure',
    description: '',
    status: 'proposée',
  });
  void commit(next);
}

function updateField(i: number, field: keyof Mesure, value: string): void {
  if (!ensureEdit()) return;
  const next = clone();
  const m = next.mesures[i];
  if (!m) return;
  (m as Record<string, unknown>)[field] = value;
  void commit(next);
}

function removeMesure(i: number): void {
  if (!ensureEdit()) return;
  const m = data.value.mesures[i];
  if (!m) return;
  if (!confirm(`Supprimer la mesure ${m.id} — « ${m.label} » ?`)) return;
  const next = clone();
  next.mesures.splice(i, 1);
  void commit(next);
}

function move(i: number, dir: -1 | 1): void {
  if (!ensureEdit()) return;
  const next = clone();
  const j = i + dir;
  if (j < 0 || j >= next.mesures.length) return;
  const a = next.mesures[i];
  const b = next.mesures[j];
  if (!a || !b) return;
  next.mesures[i] = b;
  next.mesures[j] = a;
  void commit(next);
}
</script>

<template>
  <div>
    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        placeholder="🔍 Filtrer les mesures…"
        class="fr-input"
        style="flex: 1"
      />
      <span style="font-size: 0.85rem; color: #555"
        >{{ filtered.length }} / {{ data.mesures.length }} mesure{{
          data.mesures.length > 1 ? 's' : ''
        }}</span
      >
      <button class="fr-btn fr-btn--sm" @click="addMesure">+ Ajouter</button>
    </div>

    <p v-if="data.mesures.length === 0" style="color: #888; padding: 1rem">
      Aucune mesure. Une mesure correspond à une politique publique référencée dans le projet
      (souvent identifiée par un code court type M1, M2…).
    </p>

    <div v-for="m in filtered" :key="m.id" class="mesure-card l-card">
      <div class="mesure-card__head">
        <code class="mesure-card__id">{{ m.id }}</code>
        <InlineEdit
          :value="m.label"
          :can-edit="canEdit"
          placeholder="Intitulé de la mesure…"
          display-class="mesure-card__label"
          @update="(v) => updateField(data.mesures.indexOf(m), 'label', v)"
          @edit-attempt="ensureEdit"
        />
        <span class="spacer"></span>
        <button
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          @click="move(data.mesures.indexOf(m), -1)"
        >
          ↑
        </button>
        <button
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          @click="move(data.mesures.indexOf(m), 1)"
        >
          ↓
        </button>
        <button
          class="fr-btn fr-btn--tertiary fr-btn--sm"
          style="color: #ce0500"
          @click="removeMesure(data.mesures.indexOf(m))"
        >
          🗑
        </button>
      </div>
      <div class="mesure-card__grid">
        <label class="field">
          <span>Statut</span>
          <InlineEdit
            :value="m.status ?? ''"
            :can-edit="canEdit"
            placeholder="proposée / actée / déployée…"
            @update="(v) => updateField(data.mesures.indexOf(m), 'status', v)"
            @edit-attempt="ensureEdit"
          />
        </label>
        <label class="field">
          <span>Pilote</span>
          <InlineEdit
            :value="m.pilote ?? ''"
            :can-edit="canEdit"
            placeholder="—"
            @update="(v) => updateField(data.mesures.indexOf(m), 'pilote', v)"
            @edit-attempt="ensureEdit"
          />
        </label>
      </div>
      <label class="field" style="margin-top: 0.5rem">
        <span>Description</span>
        <InlineEdit
          :value="m.description ?? ''"
          textarea
          :rows="3"
          :can-edit="canEdit"
          placeholder="Décrire l'objet de la mesure…"
          @update="(v) => updateField(data.mesures.indexOf(m), 'description', v)"
          @edit-attempt="ensureEdit"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.mesure-card {
  margin-bottom: 0.5rem;
  padding: 0.75rem 1rem;
}
.mesure-card__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.mesure-card__id {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  background: #f1f1f1;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  color: #444;
  min-width: 3rem;
  text-align: center;
}
.mesure-card :deep(.mesure-card__label) {
  font-weight: 600;
  font-size: 1rem;
}
.mesure-card__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.spacer {
  flex: 1;
}
</style>
