// Interactive decision tree for dispositifs.html
// Workflow: pick audience → pick project → answer questions → see matched outcomes & dispositifs.

const DATA_URL = 'assets/data/arbre-decision-dispositifs.json';

const state = {
  data: null,            // full JSON
  audienceId: null,
  projectId: null,
  answers: {},           // { question_id: option_id }
};

const root = document.getElementById('decision-root');

async function load() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.data = await res.json();
    render();
  } catch (e) {
    root.innerHTML = `<p class="panel-empty">Impossible de charger l'arbre : ${escapeHtml(e.message)}.</p>`;
  }
}

function render() {
  root.innerHTML = '';
  root.appendChild(renderBreadcrumb());
  if (!state.audienceId) {
    root.appendChild(renderAudiencePicker());
  } else if (!state.projectId) {
    root.appendChild(renderProjectPicker());
  } else {
    root.appendChild(renderQuestionsAndOutcomes());
  }
}

function renderBreadcrumb() {
  const wrap = document.createElement('nav');
  wrap.className = 'decision-breadcrumb';
  wrap.setAttribute('aria-label', 'Étapes');

  const steps = [];
  steps.push({ label: 'Qui êtes-vous ?', active: !state.audienceId, action: resetAll });
  if (state.audienceId) {
    const a = state.data.tree[state.audienceId];
    steps.push({ label: a.label, active: !state.projectId && state.audienceId, action: resetProject });
  }
  if (state.projectId) {
    const p = state.data.tree[state.audienceId].projects[state.projectId];
    steps.push({ label: p.label, active: true, action: resetAnswers });
  }

  steps.forEach((s, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'decision-breadcrumb__sep';
      sep.textContent = '›';
      wrap.appendChild(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'decision-breadcrumb__step';
    if (s.active) btn.classList.add('decision-breadcrumb__step--active');
    btn.textContent = s.label;
    btn.addEventListener('click', () => { s.action(); render(); });
    wrap.appendChild(btn);
  });

  if (state.audienceId) {
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'fr-btn fr-btn--tertiary fr-btn--sm fr-icon-refresh-line fr-btn--icon-left decision-breadcrumb__restart';
    restart.textContent = 'Recommencer';
    restart.addEventListener('click', () => { resetAll(); render(); });
    wrap.appendChild(restart);
  }
  return wrap;
}

function resetAll() {
  state.audienceId = null;
  state.projectId = null;
  state.answers = {};
}
function resetProject() {
  state.projectId = null;
  state.answers = {};
}
function resetAnswers() {
  state.answers = {};
}

function renderAudiencePicker() {
  const wrap = document.createElement('div');
  wrap.className = 'decision-step';
  const h = document.createElement('h2');
  h.className = 'fr-h5 fr-mb-2w';
  h.textContent = 'Qui êtes-vous ?';
  wrap.appendChild(h);

  const grid = document.createElement('div');
  grid.className = 'decision-grid';
  for (const [id, audience] of Object.entries(state.data.tree)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'decision-card';
    card.innerHTML = `
      <div class="decision-card__title">${escapeHtml(audience.label)}</div>
      ${audience.subtitle ? `<div class="decision-card__sub">${escapeHtml(audience.subtitle)}</div>` : ''}
    `;
    card.addEventListener('click', () => {
      state.audienceId = id;
      render();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderProjectPicker() {
  const audience = state.data.tree[state.audienceId];
  const wrap = document.createElement('div');
  wrap.className = 'decision-step';
  const h = document.createElement('h2');
  h.className = 'fr-h5 fr-mb-2w';
  h.textContent = `Quel est votre projet ?`;
  wrap.appendChild(h);

  const grid = document.createElement('div');
  grid.className = 'decision-grid';
  for (const [id, project] of Object.entries(audience.projects)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'decision-card';
    card.innerHTML = `
      <div class="decision-card__title">${escapeHtml(project.label)}</div>
      ${project.subtitle ? `<div class="decision-card__sub">${escapeHtml(project.subtitle)}</div>` : ''}
    `;
    card.addEventListener('click', () => {
      state.projectId = id;
      state.answers = {};
      render();
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderQuestionsAndOutcomes() {
  const project = state.data.tree[state.audienceId].projects[state.projectId];
  const wrap = document.createElement('div');
  wrap.className = 'decision-step';

  const visibleQuestions = (project.questions || []).filter(q => questionApplies(q));
  if (visibleQuestions.length > 0) {
    const qh = document.createElement('h2');
    qh.className = 'fr-h5 fr-mb-2w';
    qh.textContent = 'Quelques questions pour préciser';
    wrap.appendChild(qh);

    const qWrap = document.createElement('div');
    qWrap.className = 'decision-questions';
    for (const q of visibleQuestions) {
      qWrap.appendChild(renderQuestion(q));
    }
    wrap.appendChild(qWrap);
  }

  // Outcomes (always shown — many have match='*')
  const outcomes = (project.outcomes || []).filter(o => outcomeMatches(o));
  const oh = document.createElement('h2');
  oh.className = 'fr-h5 fr-mt-4w fr-mb-2w';
  oh.textContent = 'Dispositifs recommandés';
  wrap.appendChild(oh);

  if (outcomes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'panel-empty';
    empty.textContent = 'Répondez aux questions ci-dessus pour afficher les recommandations.';
    wrap.appendChild(empty);
  } else {
    const sorted = [...outcomes].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    for (const o of sorted) {
      wrap.appendChild(renderOutcome(o));
    }
  }
  return wrap;
}

function questionApplies(q) {
  if (!q.applies_if) return true;
  for (const [qId, expected] of Object.entries(q.applies_if)) {
    if (state.answers[qId] !== expected) return false;
  }
  return true;
}

function outcomeMatches(o) {
  if (o.match === '*' || !o.match) return true;
  for (const [qId, expected] of Object.entries(o.match)) {
    const ans = state.answers[qId];
    if (ans === undefined) {
      // If the question wasn't asked (applies_if not satisfied), this match key is ignored.
      const project = state.data.tree[state.audienceId].projects[state.projectId];
      const q = (project.questions || []).find(x => x.id === qId);
      if (q && questionApplies(q)) return false;   // question is visible but unanswered → not yet matched
      continue;                                     // question not visible at all → ignore this key
    }
    if (Array.isArray(expected)) {
      if (!expected.includes(ans)) return false;
    } else {
      if (ans !== expected) return false;
    }
  }
  return true;
}

function renderQuestion(q) {
  const wrap = document.createElement('div');
  wrap.className = 'decision-question';
  const lbl = document.createElement('div');
  lbl.className = 'decision-question__label';
  lbl.textContent = q.label;
  wrap.appendChild(lbl);

  const opts = document.createElement('div');
  opts.className = 'decision-question__options';
  for (const opt of (q.options || [])) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'decision-option';
    if (state.answers[q.id] === opt.id) btn.classList.add('decision-option--selected');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      // Toggle: clicking selected one clears it; otherwise set
      if (state.answers[q.id] === opt.id) delete state.answers[q.id];
      else state.answers[q.id] = opt.id;
      // Clear answers to questions that no longer apply
      pruneAnswers();
      render();
    });
    opts.appendChild(btn);
  }
  wrap.appendChild(opts);
  return wrap;
}

function pruneAnswers() {
  const project = state.data.tree[state.audienceId].projects[state.projectId];
  for (const q of (project.questions || [])) {
    if (!questionApplies(q) && state.answers[q.id] !== undefined) {
      delete state.answers[q.id];
    }
  }
}

const PRIORITY_BADGE = {
  0: { text: 'Étape préalable', cls: 'priority-pre' },
  1: { text: 'Recommandé',       cls: 'priority-main' },
  2: { text: 'Complémentaire',   cls: 'priority-sec' },
};

function renderOutcome(o) {
  const card = document.createElement('article');
  card.className = `outcome-card outcome-card--p${o.priority ?? 1}`;

  const head = document.createElement('div');
  head.className = 'outcome-card__head';
  const title = document.createElement('h3');
  title.className = 'fr-h6 outcome-card__title';
  title.textContent = o.label;
  head.appendChild(title);
  const pb = PRIORITY_BADGE[o.priority];
  if (pb) {
    const badge = document.createElement('span');
    badge.className = `outcome-priority ${pb.cls}`;
    badge.textContent = pb.text;
    head.appendChild(badge);
  }
  card.appendChild(head);

  if (o.explanation) {
    const exp = document.createElement('p');
    exp.className = 'outcome-card__explanation';
    exp.textContent = o.explanation;
    card.appendChild(exp);
  }

  if (Array.isArray(o.dispositifs) && o.dispositifs.length) {
    const list = document.createElement('ul');
    list.className = 'outcome-dispositifs';
    for (const d of o.dispositifs) {
      const li = document.createElement('li');
      li.className = 'outcome-dispositif';
      const head = document.createElement('div');
      head.className = 'outcome-dispositif__head';
      const ref = document.createElement('span');
      ref.className = 'outcome-dispositif__ref';
      ref.textContent = d.ref;
      const name = document.createElement('strong');
      name.className = 'outcome-dispositif__name';
      name.textContent = d.name;
      head.append(ref, name);
      if (d.role) {
        const role = document.createElement('span');
        role.className = 'outcome-dispositif__role';
        role.textContent = d.role;
        head.appendChild(role);
      }
      li.appendChild(head);

      if (d.tldr) {
        const tldr = document.createElement('p');
        tldr.className = 'outcome-dispositif__tldr';
        tldr.textContent = d.tldr;
        li.appendChild(tldr);
      }
      if (d.url) {
        const a = document.createElement('a');
        a.className = 'fr-link fr-icon-external-link-line fr-link--icon-right';
        a.href = d.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Ouvrir le service';
        li.appendChild(a);
      } else {
        const note = document.createElement('p');
        note.className = 'outcome-dispositif__note';
        note.textContent = 'Service à créer dans le hub.';
        li.appendChild(note);
      }
      list.appendChild(li);
    }
    card.appendChild(list);
  }
  return card;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

load();
