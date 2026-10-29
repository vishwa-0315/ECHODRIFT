/** Menu (home): Vyom, PLAY, rank, today's mission, Quiz to Orbit and a tile for every page. */
import { h, fitCanvas } from '../dom.js';
import { starField, drawBody } from '../render.js';
import { helioState } from '../../core/ephem.js';
import { AU } from '../../core/constants.js';
import { LEVELS } from '../../arcade/levels.js';
import { progress, dailyLevel, CERTS } from '../../game/progress.js';
import { rankCard } from '../rankBadge.js';
import { guide } from '../guide.js';
import { BUILD } from '../update.js';
import { setMood, sfx, unlockAudio } from '../audio.js';

import { profileForm } from './certs.js';
const ICONS = {
  levels: '<svg viewBox="0 0 24 24"><circle cx="5" cy="18" r="2.5"/><circle cx="12" cy="11" r="2.5"/><circle cx="19" cy="5" r="2.5"/><path d="M6.8 16.2l3.4-3.4M13.8 9.2l3.4-2.4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  expert: '<svg viewBox="0 0 24 24"><path d="M12 2c3 3 4 7 3 11l-3 3-3-3c-1-4 0-8 3-11z"/><path d="M9 15l-3 4 4-1M15 15l3 4-4-1"/></svg>',
  explorer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>',
  hangar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="M8 14l-2 8 6-3 6 3-2-8z"/></svg>',
  certs: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><circle cx="16" cy="17" r="3" fill="#0b1020" stroke="currentColor" stroke-width="1.6"/></svg>',
  settings2: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.7v-2.4l-2.4-.6a7 7 0 0 0-.7-1.7l1.3-2.1-1.7-1.7-2.1 1.3a7 7 0 0 0-1.7-.7L13.2 3h-2.4l-.6 2.4a7 7 0 0 0-1.7.7L6.4 4.8 4.7 6.5 6 8.6a7 7 0 0 0-.7 1.7L3 10.8v2.4l2.4.6c.2.6.4 1.2.7 1.7l-1.3 2.1 1.7 1.7 2.1-1.3c.5.3 1.1.5 1.7.7l.6 2.4h2.4l.6-2.4c.6-.2 1.2-.4 1.7-.7l2.1 1.3 1.7-1.7-1.3-2.1c.3-.5.5-1.1.7-1.7z" fill-rule="evenodd"/></svg>',
  about: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10.5v6M12 7.2v.1" stroke="#0b1020" stroke-width="2.4" stroke-linecap="round"/></svg>',
  tour: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z" fill="#0b1020"/></svg>',
};

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

  const tile = (screen, title, sub, ic) => h('button.menu-tile', { 'data-testid': 'tile-' + screen, onclick: () => (unlockAudio(), sfx.tap(), app.go(screen)) }, h('span.mt-ic', { 'aria-hidden': 'true', innerHTML: ICONS[ic] }), h('b', title), h('span.small.muted', sub));
  const el = h(
    'div.screen.home',
    h(
      'div.hero',
      sky,
      h('div.inner', h('div.label', 'Real missions · real physics', h('span.ver-chip', { 'data-testid': 'version' }, `v1.0.${BUILD || 0}`)), h('h1', 'Launch Window'), h('p.tagline', 'Fly India’s and NASA’s real space missions. Every orbit and landing follows the real laws of physics.'), h('button.btn.sm.ghost.settings-chip', { 'data-testid': 'settings', 'aria-label': 'Settings', onclick: () => (sfx.tap(), app.go('settings')) }, 'Settings')),
    ),
    g.el,
    h(
      'div.play-row',
      next
        ? h('button.btn.primary.play-btn', { 'data-testid': 'play', onclick: () => (unlockAudio(), sfx.tap(), app.go('play', { id: next.id })) }, h('span', 'PLAY'), h('span.small', `Level ${LEVELS.indexOf(next) + 1}: ${next.title}`))
        : h('button.btn.primary.play-btn', { onclick: () => app.go('play', { id: LEVELS[0].id }) }, h('span', 'PLAY AGAIN'), h('span.small', 'Can you get 3 stars everywhere?')),
      h('div.star-total', { 'aria-label': `${total} stars collected` }, h('span.big', `★ ${total}`), h('span.small.muted', 'stars')),
    ),
    rankCard(prog.rank(), total, { onclick: () => (sfx.tap(), app.go('profile')) }),
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
    h(
      'nav.menu-grid',
      { 'aria-label': 'Main menu' },
      tile('levels', 'Levels', `${prog.levelsDone()} of ${LEVELS.length} missions flown`, 'levels'),
      tile('expert', 'Expert & labs', 'Full missions on real dates', 'expert'),
      tile('explorer', 'Solar System', 'Where the planets are today', 'explorer'),
      tile('profile', 'Profile & rank', prog.profile().name ? prog.profile().name.split(' ')[0] + ' · ' + prog.rank().name : 'Your pilot card and rank', 'profile'),
      tile('hangar', 'Badges & rockets', `${Object.keys(prog.data.badges).length} badges earned`, 'hangar'),
      tile('certs', 'Certificates', `${CERTS.filter((c) => prog.certEarned(c.id)).length} of ${CERTS.length} unlocked`, 'certs'),
      tile('settings', 'Settings', 'Sound, voice, tips, tutorials', 'settings2'),
      tile('about', 'How it works', 'The physics inside the game', 'about'),
      h('button.menu-tile.tour-tile', { 'data-testid': 'tile-tour', onclick: () => (sfx.tap(), app.go('intro', { replay: true })) }, h('span.mt-ic', { 'aria-hidden': 'true', innerHTML: ICONS.tour }), h('b', 'How to play'), h('span.small.muted', 'Watch the intro again')),
    ),
    h('p.small.muted', { style: { marginTop: '14px' } }, `Version 1.0.${BUILD || 0} (build ${BUILD || 'test'}). `, 'For all ages. Every level uses real gravity, real engines and real mission data. Stuck? Vyom can show you how.'),
  );

  return {
    el,
    tour: [
      { title: 'Welcome to the Menu', text: 'This is your mission control. Here is a quick look around. You can skip any time.' },
      { sel: '[data-testid="play"], .play-btn', title: 'PLAY', text: 'Starts your next mission straight away.' },
      { sel: '.rank-card', title: 'Your rank', text: 'Stars from missions raise your rank, from Bronze to Grandmaster. Tap it to see the whole ladder.' },
      { sel: '.daily-card', title: 'Today’s mission', text: 'One mission a day. Win it on days in a row to build a streak.' },
      { sel: '.quiz-play', title: 'Quiz to Orbit', text: 'Every right answer is a burn. Reach the real orbital speed of 7.8 km/s.' },
      { sel: '.menu-grid', title: 'Every page', text: 'Levels, Profile, Certificates, Settings and more. Each page has its own short tour the first time.' },
    ],
    mounted() {
      draw();
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
      // ask once for the player's details (used on certificates), after a first win
      if (!prog.profile().name && !app.settings.askedProfile && total > 0) {
        app.setSetting('askedProfile', true);
        setTimeout(() => {
          const ov = h('div.overlay', { role: 'dialog', 'aria-modal': 'true' }, h('div.modal', h('h2', 'Your pilot profile'), h('p.muted', 'Vyom will print these on the certificates you unlock.'), profileForm(app, () => (ov.remove(), app.go('home'))), h('button.btn.ghost.block', { style: { marginTop: '8px' }, onclick: () => ov.remove(), 'data-testid': 'pf-later' }, 'Later')));
          el.appendChild(ov);
        }, 900);
      }
    },
    destroy: () => clearInterval(raf),
  };
}
