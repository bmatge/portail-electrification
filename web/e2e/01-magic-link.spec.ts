// E2E 1/3 — Login magic link.
//
// Pré-requis : server en mode dev avec MAILER_DRIVER=memory ou console,
// et la SPA build/dev sur la même origine que /api. En mode memory, on
// peut lire l'inbox via /api/test/inbox (à câbler) ; sinon, on stub via
// fetch direct sur /api/auth/magic-link et on consomme le token depuis
// les logs (mode dev).
//
// Pour rester e2e portable, ce parcours teste le flow front jusqu'à
// l'envoi de la magic link et vérifie le toast de confirmation. La
// consommation du callback est testée dans 02-tree-edit.spec.ts via
// un cookie de session pré-injecté.

import { test, expect } from '@playwright/test';

test('login : un visiteur peut demander un magic link', async ({ page }) => {
  await page.goto('/');
  // L'anonyme voit la liste des projets publics
  await expect(page.getByText("L'atelier")).toBeVisible();
  // Lien Se connecter en haut
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/login/);
  // Saisit son email
  await page.getByPlaceholder(/email/i).fill('e2e-demo@latelier.local');
  await page.getByRole('button', { name: /(Recevoir|Se connecter|Envoyer)/i }).click();
  // Toast / message de confirmation
  await expect(page.getByText(/(envoyé|reçu|consultez)/i)).toBeVisible({ timeout: 5000 });
});
