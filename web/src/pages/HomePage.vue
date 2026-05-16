<script setup lang="ts">
// Picker — liste des projets, création de nouveau projet, import bundle JSON.
// Reproduit l'organisation 2-colonnes du legacy (`index.html`) :
//   - gauche : "Projets existants" (cartes enrichies)
//   - droite : "Nouveau projet" (form) + "Importer un projet" (file input)

import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  listProjects,
  createProject,
  deleteProject,
  exportProjectBundle,
  importProjectBundle,
  type ProjectListItem,
} from '../api/projects.api.js';
import { useAuthStore } from '../stores/auth.js';
import { useConfirm } from '../stores/confirm.js';
import PageHeader from '../components/ui/PageHeader.vue';

const confirm = useConfirm();

const auth = useAuthStore();
const projects = ref<readonly ProjectListItem[]>([]);
const loading = ref(true);

const newSlug = ref('');
const newName = ref('');
const newDescription = ref('');
const createError = ref<string | null>(null);
const creating = ref(false);

const importError = ref<string | null>(null);
const importing = ref(false);

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    projects.value = await listProjects();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function slugifyName(): void {
  if (!newSlug.value && newName.value) {
    newSlug.value = newName.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }
}

async function handleCreate(): Promise<void> {
  createError.value = null;
  creating.value = true;
  try {
    const payload: { slug: string; name: string; description?: string } = {
      slug: newSlug.value,
      name: newName.value,
    };
    if (newDescription.value) payload.description = newDescription.value;
    await createProject(payload);
    newSlug.value = '';
    newName.value = '';
    newDescription.value = '';
    await refresh();
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    createError.value = e.response?.data?.detail || e.response?.data?.error || 'Erreur de création';
  } finally {
    creating.value = false;
  }
}

async function handleExport(slug: string): Promise<void> {
  try {
    const bundle = await exportProjectBundle(slug);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bundle-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(`Export impossible : ${(err as Error).message}`);
  }
}

async function handleDelete(p: ProjectListItem): Promise<void> {
  const ok = await confirm.ask({
    title: `Supprimer le projet « ${p.name} » ?`,
    message:
      'Toutes ses données seront perdues définitivement : arborescence, roadmap, maquette, catalogues, historique des révisions.',
    confirmLabel: 'Supprimer le projet',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteProject(p.slug);
    await refresh();
  } catch (err) {
    alert(`Suppression impossible : ${(err as Error).message}`);
  }
}

async function handleImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importError.value = null;
  importing.value = true;
  try {
    const text = await file.text();
    const bundle = JSON.parse(text) as unknown;
    await importProjectBundle(bundle);
    await refresh();
    input.value = '';
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; detail?: string } } };
    importError.value =
      e.response?.data?.detail || e.response?.data?.error || (err as Error).message;
  } finally {
    importing.value = false;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const canCreate = () => auth.can('project:create');
const canImport = () => auth.can('project:import');
</script>

<template>
  <div>
    <PageHeader
      title="Vos projets"
      subtitle="Sélectionnez un projet pour l'éditer, créez-en un nouveau, ou importez un projet exporté."
    />

    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-lg-7">
        <section class="panel-card">
          <h2 class="panel-card__title">Projets existants</h2>
          <p v-if="loading">Chargement…</p>
          <p v-else-if="projects.length === 0" style="color: #666">
            Aucun projet pour l'instant. Créez-en un à droite, ou importez un bundle JSON.
          </p>
          <article v-for="p in projects" :key="p.id" class="project-card">
            <div class="project-card__head">
              <RouterLink :to="`/p/${p.slug}/arborescence`" class="project-card__title">
                {{ p.name }}
              </RouterLink>
              <code class="project-card__slug">{{ p.slug }}</code>
              <span class="badge" :class="p.is_public ? 'badge-public' : 'badge-private'">
                {{ p.is_public ? '🌐 Public' : '🔒 Privé' }}
              </span>
            </div>
            <p v-if="p.description" class="project-card__desc">{{ p.description }}</p>
            <p class="project-card__meta">
              {{ p.revision_count }} révision{{ p.revision_count > 1 ? 's' : '' }} · créé le
              {{ fmtDate(p.created_at) }}
            </p>
            <div class="project-card__actions">
              <RouterLink
                :to="`/p/${p.slug}/arborescence`"
                class="fr-btn fr-btn--sm fr-icon-edit-line fr-btn--icon-left"
              >
                Ouvrir
              </RouterLink>
              <button
                class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-download-line fr-btn--icon-left"
                @click="handleExport(p.slug)"
              >
                Exporter
              </button>
              <button
                v-if="auth.can('project:delete:own', p.id)"
                class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-delete-line fr-btn--icon-left"
                style="color: #ce0500"
                @click="handleDelete(p)"
              >
                Supprimer
              </button>
            </div>
          </article>
        </section>
      </div>

      <div class="fr-col-12 fr-col-lg-5">
        <section v-if="canCreate()" class="panel-card">
          <h2 class="panel-card__title">Nouveau projet</h2>
          <form @submit.prevent="handleCreate">
            <label class="field">
              <span>Nom</span>
              <input
                v-model="newName"
                type="text"
                class="fr-input"
                required
                placeholder="Hub mobilités propres…"
                @blur="slugifyName"
              />
            </label>
            <label class="field">
              <span>Slug <small style="color: #888">(a-z, 0-9, tirets)</small></span>
              <input
                v-model="newSlug"
                type="text"
                class="fr-input"
                required
                pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?"
                placeholder="hub-mobilites-propres"
              />
            </label>
            <label class="field">
              <span>Description (optionnel)</span>
              <textarea
                v-model="newDescription"
                class="fr-input"
                rows="2"
                placeholder="Une phrase pour situer le projet…"
              />
            </label>
            <p v-if="createError" class="alert alert-error">{{ createError }}</p>
            <p>
              <button
                type="submit"
                class="fr-btn fr-icon-add-line fr-btn--icon-left"
                :disabled="creating"
              >
                {{ creating ? 'Création…' : 'Créer le projet' }}
              </button>
            </p>
          </form>
        </section>
        <section v-else class="panel-card alert">
          Vous êtes <strong>viewer</strong> : vous pouvez consulter les projets publics mais pas en
          créer. Demandez à un admin l'attribution d'un rôle <code>editor</code>.
        </section>

        <section v-if="canImport()" class="panel-card">
          <h2 class="panel-card__title">Importer un projet</h2>
          <p style="color: #666; font-size: 0.9rem; margin-top: 0">
            Importez un fichier JSON au format bundle (arbre, roadmap, vocab, catalogues). Voir
            <code>docs/bundle-format.md</code>.
          </p>
          <label class="fr-btn fr-btn--secondary fr-icon-upload-line fr-btn--icon-left">
            {{ importing ? 'Import en cours…' : 'Sélectionner un fichier JSON…' }}
            <input
              type="file"
              accept="application/json"
              style="display: none"
              :disabled="importing"
              @change="handleImport"
            />
          </label>
          <p v-if="importError" class="alert alert-error" style="margin-top: 0.5rem">
            {{ importError }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
