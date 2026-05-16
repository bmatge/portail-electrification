<script setup lang="ts">
// Footer DSFR officiel — Marianne tricolore + description + liens utiles +
// mentions légales. Reproduit `assets/layout.js` legacy renderFooter().
</script>

<template>
  <footer class="fr-footer" role="contentinfo">
    <div class="fr-container">
      <div class="fr-footer__body">
        <div class="fr-footer__brand fr-enlarge-link">
          <p class="fr-logo">République<br />Française</p>
        </div>
        <div class="fr-footer__content">
          <p class="fr-footer__content-desc">
            L'atelier — cadrage de sites institutionnels : arborescence, maquette, roadmap,
            ressources et politiques publiques, par projet.
          </p>
          <ul class="fr-footer__content-list">
            <li class="fr-footer__content-item">
              <a class="fr-footer__content-link" href="/">Liste des projets</a>
            </li>
            <li class="fr-footer__content-item">
              <a
                class="fr-footer__content-link"
                href="https://www.systeme-de-design.gouv.fr"
                target="_blank"
                rel="noopener"
                >Système de design</a
              >
            </li>
          </ul>
        </div>
      </div>
      <div class="fr-footer__bottom">
        <ul class="fr-footer__bottom-list">
          <li class="fr-footer__bottom-item">
            <a
              class="fr-footer__bottom-link"
              href="https://github.com/bmatge/latelier-cadrage-site"
              target="_blank"
              rel="noopener"
              >Code source</a
            >
          </li>
          <li class="fr-footer__bottom-item">
            <a
              class="fr-footer__bottom-link"
              href="https://github.com/bmatge/latelier-cadrage-site/issues"
              target="_blank"
              rel="noopener"
              >Signaler un problème</a
            >
          </li>
        </ul>
        <div class="fr-footer__bottom-copy">
          <p>
            Sauf mention contraire, code sous licence MIT. Données ouvertes — aucune donnée
            personnelle collectée.
          </p>
        </div>
      </div>
    </div>
  </footer>
</template>
