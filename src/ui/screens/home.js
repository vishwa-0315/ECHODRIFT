/** Home: Vyom says hello, one big PLAY button, the level tiles, badges and extras. */
import { h, fitCanvas } from '../dom.js';
import { starField, drawBody } from '../render.js';
import { helioState } from '../../core/ephem.js';
import { AU } from '../../core/constants.js';
import { LEVELS } from '../../arcade/levels.js';
import { progress } from '../../game/progress.js';
import { guide } from '../guide.js';
import { checkForUpdates, BUILD } from '../update.js';
import { setAudio, setMood, startMusic, sfx, unlockAudio } from '../audio.js';

const BODY = { earthrise: 'earth', eagle: 'moon', home13: 'earth', slingshot: 'jupiter', rohini: 'earth', cassini: 'saturn', mip: 'moon', window: 'mars', escape: 'earth', marscapture: 'mars', pluto: 'pluto', juno: 'jupiter', sats104: 'earth', terror: 'mars', raise: 'earth', moonshot: 'moon', catchmoon: 'moon', vikram: 'moon', hop: 'moon', spadex: 'earth' };
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
  const g = guide({ compact: true });

  const ERAS = [
    { to: 1990, title: '1968–1980 · The first giant leaps' },
    { to: 2020, title: '2004–2017 · New explorers' },
    { to: 9999, title: '2021–2025 · Mars rovers and India on the Moon' },
  ];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (d) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;
  const node = (L, i) => {
    const open = prog.unlocked(L.id);
    const st = prog.stars(L.id);
    const cls = (open ? '' : '.locked') + (next?.id === L.id ? '.next' : '') + (st ? '.done' : '');
    return h(
      'button.tl-node' + cls,
      { 'data-testid': 'level-' + L.id, disabled: !open, onclick: () => (sfx.tap(), app.go('play', { id: L.id })), 'aria-label': `${L.year}, level ${i + 1}: ${L.title}${open ? `, ${st} stars` : ', locked'}` },
      h('div.tl-when', h('div.tl-year', String(L.year)), h('div.tl-day', fmtDate(L.date))),
      open ? h('div.tl-dot', { 'aria-hidden': 'true' }, String(i + 1)) : h('div.tl-dot', { 'aria-hidden': 'true', innerHTML: LOCK }),
      h(
        'div.tl-card',
        h('canvas.tl-icon', { 'aria-hidden': 'true', 'data-body': BODY[L.id] || 'earth' }),
        h('div.tl-text', h('div.tl-title', L.title), h('div.tl-mission', `${L.mission} · ${L.agency}`), h('div.tl-stars', open ? '★'.repeat(st) + '☆'.repeat(3 - st) : 'Finish the one before')),
      ),
    );
  };
  const timeline = h('div.timeline');
  {
    let era = -1;
    LEVELS.forEach((L, i) => {
      const e = ERAS.findIndex((x) => L.year < x.to);
      if (e !== era) {
        era = e;
        timeline.appendChild(h('div.tl-era', ERAS[e].title));
      }
      timeline.appendChild(node(L, i));
    });
    // missions still to come: shown on the timeline, playable in a future update
    const FUTURE = [
      ['earth', 'Gaganyaan', 'ISRO', 'India’s first crewed spaceflight'],
      ['moon', 'Chandrayaan-4', 'ISRO', 'Bring Moon rocks back to Earth'],
      ['moon', 'Artemis', 'NASA', 'Astronauts return to the Moon'],
      ['venus', 'Shukrayaan', 'ISRO', 'An orbiter for Venus'],
      ['earth', 'Bharatiya Antariksh Station', 'ISRO', 'India’s own space station'],
    ];
    timeline.appendChild(h('div.tl-era', 'Coming soon · the next missions'));
    for (const [ic, name, ag, what] of FUTURE)
      timeline.appendChild(
        h('div.tl-node.future', { 'aria-label': `Coming soon: ${name}` }, h('div.tl-when', h('div.tl-year', 'Soon'), h('div.tl-day', 'planned')), h('div.tl-dot', { 'aria-hidden': 'true' }, '…'), h('div.tl-card', h('canvas.tl-icon', { 'aria-hidden': 'true', 'data-body': ic }), h('div.tl-text', h('div.tl-title', name), h('div.tl-mission', `${ag} · ${what}`), h('div.tl-stars', 'Level coming in a future update')))),
      );
  }

  const musicBtn = h('button.btn.sm.ghost.toggle-btn', { 'aria-label': 'Music on or off', onclick: () => toggle('music') });
  const soundBtn = h('button.btn.sm.ghost.toggle-btn', { 'aria-label': 'Sound effects on or off', onclick: () => toggle('sound') });
  const paintToggles = () => {
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
      h('div.home-toggles', musicBtn, soundBtn),
      h('div.inner', h('div.label', 'Real missions · real physics'), h('h1', 'Launch Window'), h('p.tagline', 'Fly India’s and NASA’s real space missions. Every orbit and landing follows the real laws of physics.')),
    ),
    g.el,
    h(
      'div.play-row',
      next
        ? h('button.btn.primary.play-btn', { 'data-testid': 'play', onclick: () => (unlockAudio(), sfx.tap(), app.go('play', { id: next.id })) }, h('span', 'PLAY'), h('span.small', `Level ${LEVELS.indexOf(next) + 1}: ${next.title}`))
        : h('button.btn.primary.play-btn', { onclick: () => app.go('play', { id: LEVELS[0].id }) }, h('span', 'PLAY AGAIN'), h('span.small', 'Can you get 3 stars everywhere?')),
      h('div.star-total', { 'aria-label': `${total} stars collected` }, h('span.big', `★ ${total}`), h('span.small.muted', 'stars')),
    ),
    h('button.btn.quiz-play', { 'data-testid': 'quizgame', onclick: () => (unlockAudio(), sfx.tap(), app.go('quizgame')) }, h('span.qp-ic', { 'aria-hidden': 'true' }), h('span', h('b', 'Quiz to Orbit'), h('span.small.muted', ' · answer right to fly to orbital speed'))),
    h('div.section', h('h3', 'Mission timeline'), h('span.small.muted', 'Real missions in the order they happened')),
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
          ? ['Namaste! I’m Vyom, your mission buddy. ', 'Each level is a real space mission. One button, real physics.', 'Press PLAY to start!']
          : next
            ? [`Welcome back! Next up: ${next.title}.`]
            : ['Every level done! Can you get 3 stars on all of them?'];
      setTimeout(() => g.say(lines, 'happy'), 250);
    },
    destroy: () => clearInterval(raf),
  };
}
