/** Home: Vyom says hello, one big PLAY button, the level tiles, badges and extras. */
import { h, fitCanvas } from '../dom.js';
import { starField, drawBody } from '../render.js';
import { helioState } from '../../core/ephem.js';
import { AU } from '../../core/constants.js';
import { LEVELS } from '../../arcade/levels.js';
import { progress, rankFor, nextRank, dailyLevel } from '../../game/progress.js';
import { guide, voiceAvailable } from '../guide.js';
import { checkForUpdates, BUILD } from '../update.js';
import { setAudio, setMood, startMusic, sfx, unlockAudio } from '../audio.js';
import { briefFor } from '../debrief.js';

import { BODY } from '../levelIcons.js';
const LOCK = '<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><rect x="1" y="7" width="12" height="8" rx="2" fill="currentColor"/><path d="M4 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

export function homeScreen(app, params = {}) {
  const prog = progress(app);
  const sky = h('canvas', { 'aria-hidden': 'true' });
  const stars = starField(380, 3);
  let raf = 0;
  const draw = () => {
    const { w, h: hh, ctx } = fitCanvas(sky);
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, hh);
    stars(ctx, w, hh);
    const now = new Date();
    const cx = w * 0.82, cy = hh * 0.5, s = Math.min(w * 0.15, hh * 0.36) / (1.6 * AU);
    ctx.strokeStyle = 'rgba(141,156,181,0.18)';
    for (const r of [0.387, 0.723, 1, 1.524]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * AU * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawBody(ctx, 'sun', cx, cy, 6);
    for (const b of ['mercury', 'venus', 'earth', 'mars']) {
      const p = helioState(b, now);
      const x = cx + p.x * s, y = cy - p.y * s;
      drawBody(ctx, b, x, y, b === 'earth' ? 4 : 3, Math.atan2(cy - y, cx - x), { minR: 3 });
    }
  };
  const total = prog.total();
  const next = prog.nextLevel();
  // tap Vyom any time for a real space fact (no repeats until all have been heard)
  const FACTS = [
    ...LEVELS.map((L) => L.fact),
    'Sunlight takes about 8 minutes to reach Earth, so you always see the Sun as it was 8 minutes ago.',
    'Astronauts in orbit feel weightless because they are falling around Earth all the time, not because there is no gravity.',
    'A day on Venus is longer than its year!',
    'The Moon moves about 3.8 cm farther from Earth every year.',
    'Jupiter is so big that more than 1,000 Earths could fit inside it.',
    'The footprints on the Moon will last for millions of years: there is no wind to blow them away.',
    'Saturn is so light for its size that it would float in a giant bathtub of water.',
    'India’s first rocket parts were carried to the launch pad at Thumba on a bicycle in 1963.',
    'Mangalyaan cost less to make than many Hollywood space films.',
    'Mars has the tallest volcano in the Solar System, Olympus Mons, about 22 km high.',
  ];
  let factBag = [];
  const nextFact = () => {
    if (!factBag.length) factBag = FACTS.map((_, i) => i).sort(() => Math.random() - 0.5);
    return FACTS[factBag.pop()];
  };
  const g = guide({ compact: true, persist: true, onTap: () => g.say(['Did you know? ' + nextFact(), 'Tap me for another fact!'], 'wow') });

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

  const musicBtn = h('button.btn.sm.ghost.toggle-btn', { 'aria-label': 'Music on or off', onclick: () => toggle('music') });
  const soundBtn = h('button.btn.sm.ghost.toggle-btn', { 'aria-label': 'Sound effects on or off', onclick: () => toggle('sound') });
  const voiceBtn = voiceAvailable() ? h('button.btn.sm.ghost.toggle-btn', { 'aria-label': 'Vyom’s voice on or off', 'data-testid': 'voice', onclick: () => (app.setSetting('voice', app.settings.voice !== true), paintToggles(), sfx.tap(), app.settings.voice && g.say(['Hello! Now I can talk too.'], 'happy')) }) : null;
  const tipsBtn = h('button.btn.sm.ghost.toggle-btn', { 'aria-label': 'Vyom’s tips during flights on or off', 'data-testid': 'tips', onclick: () => (app.setSetting('coach', app.settings.coach === false), paintToggles(), sfx.tap()) });
  const paintToggles = () => {
    tipsBtn.textContent = app.settings.coach === false ? 'Tips off' : 'Tips on';
    tipsBtn.classList.toggle('off', app.settings.coach === false);
    if (voiceBtn) {
      voiceBtn.textContent = app.settings.voice === true ? 'Voice on' : 'Voice off';
      voiceBtn.classList.toggle('off', app.settings.voice !== true);
    }
    musicBtn.textContent = app.settings.music === false ? 'Music off' : 'Music on';
    musicBtn.classList.toggle('off', app.settings.music === false);
    soundBtn.textContent = app.settings.sound === false ? 'Sound off' : 'Sound on';
    soundBtn.classList.toggle('off', app.settings.sound === false);
  };
  function toggle(k) {
    unlockAudio();
    app.setSetting(k, app.settings[k] === false);
    setAudio({ music: app.settings.music !== false, sounds: app.settings.sound !== false });
    if (k === 'music' && app.settings.music !== false) startMusic('menu');
    paintToggles();
    sfx.tap();
  }
  paintToggles();

  const el = h(
    'div.screen.home',
    h(
      'div.hero',
      sky,
      h('div.inner', h('div.label', 'Real missions · real physics'), h('h1', 'Launch Window'), h('p.tagline', 'Fly India’s and NASA’s real space missions. Every orbit and landing follows the real laws of physics.'), h('div.home-toggles', musicBtn, soundBtn, voiceBtn, tipsBtn)),
    ),
    g.el,
    h(
      'div.play-row',
      next
        ? h('button.btn.primary.play-btn', { 'data-testid': 'play', onclick: () => (unlockAudio(), sfx.tap(), app.go('play', { id: next.id })) }, h('span', 'PLAY'), h('span.small', `Level ${LEVELS.indexOf(next) + 1}: ${next.title}`))
        : h('button.btn.primary.play-btn', { onclick: () => app.go('play', { id: LEVELS[0].id }) }, h('span', 'PLAY AGAIN'), h('span.small', 'Can you get 3 stars everywhere?')),
      h('div.star-total', { 'aria-label': `${total} stars collected` }, h('span.big', `★ ${total}`), h('span.small.muted', 'stars')),
    ),
    (() => {
      const rk = rankFor(total), nx = nextRank(total);
      const pct = nx ? ((total - rk.need) / (nx.need - rk.need)) * 100 : 100;
      return h('div.rank-card', { 'aria-label': `Rank: ${rk.name}` }, h('div.medal', '★'), h('div.grow', h('div.rk-name', rk.name), h('div.small.muted', nx ? `${nx.need - total} more stars to become ${nx.name}` : 'Top rank! Every mission mastered.'), h('div.rank-bar', h('div', { style: { width: pct + '%' } }))));
    })(),
    (() => {
      const D = dailyLevel(), done = prog.dailyDoneToday(), streak = prog.dailyStreak();
      return h(
        'button.daily-card',
        { 'data-testid': 'daily', onclick: () => (unlockAudio(), sfx.tap(), app.go('play', { id: D.id })) },
        h('span.medal', '★'),
        h('div.grow', h('div.small.muted', done ? 'Today’s mission: done!' : 'Today’s mission'), h('b', `${D.title} · ${D.mission}`), h('div.small.muted', streak ? `Daily streak: ${streak} day${streak > 1 ? 's' : ''}${done ? '' : ' (fly today to keep it)'}` : 'Win it today to start a daily streak')),
        h('span', done ? 'Done' : 'Fly ▸'),
      );
    })(),
    h('button.btn.quiz-play', { 'data-testid': 'quizgame', onclick: () => (unlockAudio(), sfx.tap(), app.go('quizgame')) }, h('span.qp-ic', { 'aria-hidden': 'true' }), h('span', h('b', 'Quiz to Orbit'), h('span.small.muted', ' · answer right to fly to orbital speed'))),
    pills,
    h('div.section', h('h3', 'Mission timeline'), counter),
    timeline,
    h(
      'div.home-more',
      h('button.btn', { onclick: () => app.go('hangar'), 'data-testid': 'hangar' }, `Badges & rockets (${Object.keys(prog.data.badges).length})`),
      h('button.btn', { onclick: () => app.go('explorer') }, 'Solar System now'),
      h('button.btn', { onclick: () => app.go('expert'), 'data-testid': 'expert' }, 'Expert missions & labs'),
      h('button.btn.ghost', { onclick: () => app.go('about') }, 'How the physics works'),
      h('button.btn', { onclick: () => checkForUpdates(app), 'data-testid': 'updates' }, 'Check for updates'),
    ),
    h('p.small.muted', { style: { marginTop: '14px' } }, `Version: build ${BUILD || 'test'}. `, 'For all ages. Every level uses real gravity, real engines and real mission data. Stuck? Vyom can show you how.'),
  );

  return {
    el,
    mounted() {
      draw();
      // small real-looking planet or moon for each mission on the timeline
      for (const c of el.querySelectorAll('canvas.tl-icon')) {
        const { w, h: hh, ctx } = fitCanvas(c);
        drawBody(ctx, c.dataset.body, w / 2, hh / 2, Math.min(w, hh) * 0.42, -2.3, { dpr: 2 });
      }
      raf = setInterval(draw, 1000);
      setMood('menu');
      const first = !total && !Object.keys(prog.data.tries).length;
      const lines = params.finished
        ? ['You finished every level! ', 'Try for 3 stars everywhere, or take on the Expert missions.']
        : first
          ? ['Namaste! I’m Vyom, your mission buddy. ', 'Each level is a real space mission, with real physics.', 'Press PLAY to start!']
          : next
            ? [`Welcome back! Next up: ${next.title}.`]
            : ['Every level done! Can you get 3 stars on all of them?'];
      setTimeout(() => g.say([...lines, 'Tap me any time for a space fact!'], 'happy'), 250);
    },
    destroy: () => clearInterval(raf),
  };
}
