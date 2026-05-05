// Renders the identity badge in #identity-zone on every page.
// On the arborescence page, script.js handles its own identification flow
// (forced login before loading the tree); this module skips re-rendering
// there to avoid double prompts.

import { collab, ensureIdentified } from './collab.js';

const isArborescencePage = document.body.dataset.page === 'arborescence';

async function render() {
  const el = document.getElementById('identity-zone');
  if (!el) return;
  el.innerHTML = '';

  if (collab.user) {
    const span = document.createElement('span');
    span.className = 'identity-name';
    span.textContent = collab.user.name;
    const change = document.createElement('button');
    change.type = 'button';
    change.className = 'fr-btn fr-btn--tertiary fr-btn--sm';
    change.textContent = 'Changer';
    change.addEventListener('click', async () => {
      await collab.logout();
      await ensureIdentified();
      render();
    });
    el.append('Identifié comme ', span, ' ', change);
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-account-line fr-btn--icon-left';
    btn.textContent = "S'identifier";
    btn.addEventListener('click', async () => {
      await ensureIdentified();
      render();
    });
    el.appendChild(btn);
  }
}

async function init() {
  // On the arborescence page, script.js already calls ensureIdentified() and
  // renderIdentity() in its init flow. We let it own that lifecycle there.
  if (isArborescencePage) return;

  try {
    await collab.me();   // populates collab.user from cookie if identified
  } catch { /* server unreachable: render unidentified state */ }
  render();
}

init();
