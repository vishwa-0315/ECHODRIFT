/** Home: Vyom says hello, one big PLAY button, the level tiles, badges and extras. */
import { h, fitCanvas } from '../dom.js';
import { starField, drawBody } from '../render.js';
import { helioState } from '../../core/ephem.js';
import { AU } from '../../core/constants.js';
import { LEVELS, CHAPTERS, levelById } from '../../arcade/levels.js';
import { progress } from '../../game/progress.js';
import { guide } from '../guide.js';
import { setAudio, setMood, startMusic, sfx, unlockAudio } from '../audio.js';

const ICON = { raise: '🛰️', moonshot: '🌙', catchmoon: '🎯', vikram: '🛬', window: '🪐', marscapture: '🔴', terror: '🪂', slingshot: '☄️', hop: '🦘', home13: '🌊', escape: '🚀' };

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

  const tile = (L, i) => {
    const open = prog.unlocked(L.id);
    const st = prog.stars(L.id);
    return h(
      'button.level-tile' + (open ? '' : '.locked') + (next?.id === L.id ? '.next' : ''),
      { 'data-testid': 'level-' + L.id, disabled: !open, onclick: () => (sfx.tap(), app.go('play', { id: L.id })), 'aria-label': `Level ${i + 1}: ${L.title}${open ? `, ${st} stars` : ', locked'}` },
      h('div.lt-num', open ? String(i + 1) : '🔒'),
      h('div.lt-icon', { 'aria-hidden': 'true' }, ICON[L.id]),
      h('div.lt-title', L.title),
      h('div.lt-mission', `${L.mission} · ${L.year}`),
      h('div.lt-stars', open ? '★'.repeat(st) + '☆'.repeat(3 - st) : 'Finish the level before'),
    );
  };

  const musicBtn = h('button.btn.icon.sm.ghost', { 'aria-label': 'Music on or off', onclick: () => toggle('music') });
  const soundBtn = h('button.btn.icon.sm.ghost', { 'aria-label': 'Sound effects on or off', onclick: () => toggle('sound') });
  const paintToggles = () => {
    musicBtn.textContent = app.settings.music === false ? '🎵̸' : '🎵';
    musicBtn.classList.toggle('off', app.settings.music === false);
    soundBtn.textContent = app.settings.sound === false ? '🔇' : '🔊';
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
        ? h('button.btn.primary.play-btn', { 'data-testid': 'play', onclick: () => (unlockAudio(), sfx.tap(), app.go('play', { id: next.id })) }, h('span', '▶ PLAY'), h('span.small', `Level ${LEVELS.indexOf(next) + 1}: ${next.title}`))
        : h('button.btn.primary.play-btn', { onclick: () => app.go('play', { id: LEVELS[0].id }) }, h('span', '▶ PLAY AGAIN'), h('span.small', 'Can you get 3 stars everywhere?')),
      h('div.star-total', { 'aria-label': `${total} of ${LEVELS.length * 3} stars` }, h('span.big', `★ ${total}`), h('span.small.muted', `of ${LEVELS.length * 3}`)),
    ),
    CHAPTERS.map((c) => [h('div.section', h('h3', c.id === 'moon' ? '🌙 ' + c.title : '🔴 ' + c.title)), h('div.level-grid', c.levels.map((id) => tile(levelById(id), LEVELS.findIndex((l) => l.id === id))))]),
    h(
      'div.home-more',
      h('button.btn', { onclick: () => app.go('hangar'), 'data-testid': 'hangar' }, `🏅 Badges & rockets (${Object.keys(prog.data.badges).length})`),
      h('button.btn', { onclick: () => app.go('explorer') }, '🔭 Solar System now'),
      h('button.btn', { onclick: () => app.go('expert'), 'data-testid': 'expert' }, '🛰️ Expert missions & labs'),
      h('button.btn.ghost', { onclick: () => app.go('about') }, 'How the physics works'),
    ),
    h('p.small.muted', { style: { marginTop: '14px' } }, 'For all ages. Every level uses real gravity, real engines and real mission data. Stuck? Vyom can show you how.'),
  );

  return {
    el,
    mounted() {
      draw();
      raf = setInterval(draw, 1000);
      setMood('menu');
      const first = !total && !Object.keys(prog.data.tries).length;
      const lines = params.finished
        ? ['You finished every level! 🎉', 'Try for 3 stars everywhere, or take on the Expert missions.']
        : first
          ? ['Namaste! I’m Vyom, your mission buddy. 🚀', 'Each level is a real space mission. One button, real physics.', 'Press PLAY to start!']
          : next
            ? [`Welcome back! Next up: ${next.title}.`]
            : ['Every level done! Can you get 3 stars on all of them?'];
      setTimeout(() => g.say(lines, 'happy'), 250);
    },
    destroy: () => clearInterval(raf),
  };
}
