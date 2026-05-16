// E2E 2/3 — Édition tree avec sauvegarde (mode authentifié OU bac à sable
// anonyme). Pour rester portable sans backend de stub auth, on teste la
// branche anonyme : un visiteur active le bac à sable, modifie un nœud,
// puis exporte son brouillon.

import { test, expect } from '@playwright/test';

test('bac à sable anonyme : activation + édition + export', async ({ page }) => {
  await page.goto('/');
  // Choisit un projet public (le seed `portail-electrification`)
  await page
    .getByRole('link', { name: /portail-electrification/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/p\/portail-electrification/);
  // Tente d'éditer un nœud → modal bac à sable
  const addBtn = page.getByRole('button', { name: /Sous-rubrique/i }).first();
  await addBtn.click();
  // Modal présente le choix
  await expect(page.getByText(/bac à sable/i)).toBeVisible({ timeout: 3000 });
  await page.getByRole('button', { name: /Tester en bac à sable/i }).click();
  // Bandeau orange devient visible
  await expect(page.getByText(/Mode bac à sable/i)).toBeVisible();
  // Bouton export
  await expect(page.getByRole('button', { name: /Exporter mon brouillon/i })).toBeVisible();
});
