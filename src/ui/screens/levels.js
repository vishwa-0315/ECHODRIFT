/** Levels: the mission timeline with filters and mission cards. */
import { h, fitCanvas } from '../dom.js';
import { drawBody } from '../render.js';
import { LEVELS } from '../../arcade/levels.js';
import { progress, dailyLevel } from '../../game/progress.js';
import { sfx } from '../audio.js';
import { briefFor } from '../debrief.js';
import { BODY } from '../levelIcons.js';
import { vyomNote } from '../guide.js';

const LOCK = '<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><rect x="1" y="7" width="12" height="8" rx="2" fill="currentColor"/><path d="M4 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

export function levelsScreen(app) {
  const prog = progress(app);
  const next = prog.nextLevel();
  const ERAS = [
    { to: 1990, key: 'classic', title: '1968–1980 · The first giant leaps' },
    { to: 2020, key: 'explorer', title: '2004–2017 · New explorers' },
    { to: 9999, key: 'modern', title: '2021–2025 · Mars rovers and India on the Moon' },
  ];
  const isNasa = (L) => /NASA/.test(L.agency);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (d) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
  const node = (L, i, era) => {
    const open = prog.unlocked(L.id);
    const st = prog.stars(L.id);
    const cls = (open ? '' : '.locked') + (next?.id === L.id ? '.next' : '') + (st ? '.done' : '');
    const row = h(
      'div.tl-row',
      { 'data-era': era, 'data-agency': isNasa(L) ? 'nasa' : 'isro', 'data-stars': String(st) },
      h(
      'button.tl-node' + cls,
      { 'data-testid': 'level-' + L.id, disabled: !open, onclick: () => (sfx.tap(), app.go('play', { id: L.id })), 'aria-label': `${L.year}, level ${i + 1}: ${L.title}${open ? `, ${st} stars` : ', locked'}` },
      h('div.tl-when', h('div.tl-year', String(L.year)), h('div.tl-day', fmtDate(L.date))),
      open ? h('div.tl-dot', { 'aria-hidden': 'true' }, String(i + 1)) : h('div.tl-dot', { 'aria-hidden': 'true', innerHTML: LOCK }),
      h(
        'div.tl-card',
        h('canvas.tl-icon', { 'aria-hidden': 'true', 'data-body': BODY[L.id] || 'earth' }),
        h('div.tl-text', h('div.tl-title', L.title, dailyLevel().id === L.id ? h('span.daily-chip', 'Today') : null), h('div.tl-mission', `${L.mission} · ${L.agency}`), h('div.tl-stars', open ? '★'.repeat(st) + '☆'.repeat(3 - st) : 'Finish the one before')),
      ),
      ),
      briefFor(L.id) ? h('button.tl-info', { 'aria-label': `Mission card: ${L.title}`, 'data-testid': 'info-' + L.id, onclick: () => (sfx.tap(), missionCard(L, i)) }, 'i') : null,
    );
    return row;
  };

  /** Pre-flight mission card: rocket, goal in numbers, what earns each star, history card. */
  function missionCard(L, i) {
    const b = briefFor(L.id);
    const st = prog.stars(L.id);
    const close = () => ov.remove();
    const ov = h(
      'div.overlay.mission-card-ov',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Mission card: ${L.title}`, onclick: (e) => e.target === ov && close() },
      h(
        'div.modal.mission-card',
        h('div.mc-head', h('div', h('div.label', `Level ${i + 1} · ${L.year} · ${L.agency}`), h('h2', L.title), h('div.muted', L.mission)), h('button.btn.icon.sm.ghost', { 'aria-label': 'Close', onclick: close }, '×')),
        h('div.mc-sec', h('div.mc-k', 'Rocket and spacecraft'), h('div.mc-v', b.vehicle)),
        b.learn ? h('div.mc-sec', h('div.mc-k', 'You will learn'), h('ul.mc-learn', b.learn.map((t) => h('li', t)))) : null,
        h('div.mc-sec', h('div.mc-k', 'Mission goal'), h('div.mc-v', L.goal), h('dl.mc-params', b.params.map(([k, v]) => [h('dt', k), h('dd', v)]))),
        h('div.mc-sec', h('div.mc-k', `Stars · you have ${st} of 3`), h('ol.star-targets', b.stars.map((t, k) => h('li' + (k < st ? '.got' : ''), h('span.st', { 'aria-hidden': 'true' }, '★'.repeat(k + 1) + '☆'.repeat(2 - k)), h('span', t))))),
        h('div.mc-sec', h('div.mc-k', 'Controls'), h('div.mc-v', L.buttons ? `${L.buttons[0]} and ${L.buttons[1]}` : L.tapCanvas ? 'Tap the map' : L.control === 'aim+tap' ? `Slide ${L.aimLabel || 'AIM'}, tap ${L.button}` : `${L.control === 'hold' ? 'Hold' : 'Tap'} ${L.button}`), b.note ? h('div.small.muted', { style: { marginTop: '4px' } }, 'Simplified: ' + b.note) : null),
        prog.card(L.id)
          ? h('div.fact', h('b', 'History card: '), b.history)
          : h('div.fact.locked-card', h('b', 'History card locked. '), 'Answer this mission’s quiz question right to unlock it.'),
        h('div.row.wrap.result-btns', h('button.btn', { onclick: close }, 'Close'), h('button.btn.primary.grow', { 'data-testid': 'mc-play', onclick: () => (sfx.tap(), app.go('play', { id: L.id })) }, 'Launch ▸')),
      ),
    );
    el.appendChild(ov);
  }
  const timeline = h('div.timeline');
  {
    let era = -1;
    LEVELS.forEach((L, i) => {
      const e = ERAS.findIndex((x) => L.year < x.to);
      if (e !== era) {
        era = e;
        timeline.appendChild(h('div.tl-era', { 'data-era': ERAS[e].key }, ERAS[e].title));
      }
      timeline.appendChild(node(L, i, ERAS[e].key));
    });
    // missions still to come: shown on the timeline, playable in a future update
    const FUTURE = [
      ['earth', 'Gaganyaan', 'ISRO', 'India’s first crewed spaceflight'],
      ['moon', 'Chandrayaan-4', 'ISRO', 'Bring Moon rocks back to Earth'],
      ['moon', 'Artemis', 'NASA', 'Astronauts return to the Moon'],
      ['venus', 'Shukrayaan', 'ISRO', 'An orbiter for Venus'],
      ['earth', 'Bharatiya Antariksh Station', 'ISRO', 'India’s own space station'],
    ];
    timeline.appendChild(h('div.tl-era', { 'data-era': 'future' }, 'Coming soon · the next missions'));
    for (const [ic, name, ag, what] of FUTURE)
      timeline.appendChild(
        h('div.tl-node.future', { 'aria-label': `Coming soon: ${name}`, 'data-era': 'future', 'data-agency': ag.toLowerCase() }, h('div.tl-when', h('div.tl-year', 'Soon'), h('div.tl-day', 'planned')), h('div.tl-dot', { 'aria-hidden': 'true' }, '…'), h('div.tl-card', h('canvas.tl-icon', { 'aria-hidden': 'true', 'data-body': ic }), h('div.tl-text', h('div.tl-title', name), h('div.tl-mission', `${ag} · ${what}`), h('div.tl-stars', 'Level coming in a future update')))),
      );
  }

  /* ---------- quick filters ---------- */
  const FILTERS = [['all', 'All'], ['isro', 'ISRO'], ['nasa', 'NASA'], ['needs', 'Needs stars']];
  let filter = 'all';
  const counter = h('div.filter-count.small.muted', { 'aria-live': 'polite' });
  const pills = h('div.filters', { role: 'group', 'aria-label': 'Filter missions' });
  const applyFilter = () => {
    let shown = 0;
    for (const r of timeline.querySelectorAll('.tl-row')) {
      const ok = filter === 'all' || (filter === 'needs' ? +r.dataset.stars < 3 : r.dataset.agency === filter);
      r.hidden = !ok;
      if (ok) shown++;
    }
    for (const f of timeline.querySelectorAll('.tl-node.future')) f.hidden = !(filter === 'all' || f.dataset.agency === filter);
    for (const e of timeline.querySelectorAll('.tl-era')) {
      const k = e.dataset.era;
      e.hidden = ![...timeline.querySelectorAll(`[data-era="${k}"]:not(.tl-era)`)].some((x) => !x.hidden);
    }
    for (const b of pills.children) b.setAttribute('aria-pressed', String(b.dataset.f === filter));
    counter.textContent =
      filter === 'all' ? `Showing all ${shown} missions` : filter === 'needs' ? (shown ? `${shown} missions still need stars` : 'Every mission has 3 stars. Legend!') : `Showing ${shown} ${filter.toUpperCase()} missions`;
  };
  for (const [k, label] of FILTERS)
    pills.appendChild(h('button.pill', { 'data-f': k, 'data-testid': 'filter-' + k, 'aria-pressed': 'false', onclick: () => ((filter = k), sfx.tap(), applyFilter()) }, label));
  applyFilter();


  const total = prog.total();
  const el = h(
    'div.screen.levels',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back to menu', 'data-testid': 'back', onclick: () => app.go('home') }, '←'), h('h2', 'Levels'), h('span.chip', `★ ${total} / ${LEVELS.length * 3}`)),
    vyomNote(next ? `Next up: ${next.title}. Tap a mission to fly it, or tap i for its mission card.` : 'Every level done! Go back for 3 stars everywhere.', 'happy'),
    pills,
    h('div.section', h('h3', 'Mission timeline'), counter),
    timeline,
  );
  return {
    el,
    tour: [
      { sel: '.filters', title: 'Filters', text: 'Show only ISRO or NASA missions, or the ones that still need stars.' },
      { sel: '.tl-node.next, .tl-node:not(.locked)', title: 'Missions in history order', text: 'Each dot is a real mission, from 1968 to today. Tap one to fly it. Its stars show under the name.' },
      { sel: '.tl-info', title: 'Mission card', text: 'Tap i to see the real rocket, the goal in numbers, what earns each star, and the history card.' },
    ],
    mounted() {
      for (const c of el.querySelectorAll('canvas.tl-icon')) {
        const { w, h: hh, ctx } = fitCanvas(c);
        drawBody(ctx, c.dataset.body, w / 2, hh / 2, Math.min(w, hh) * 0.42, -2.3, { dpr: 2 });
      }
      el.querySelector('.tl-node.next')?.scrollIntoView({ block: 'center' });
    },
  };
}
