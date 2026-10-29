/** Expert mode: the full missions (plan every burn yourself), discovery labs and the Solar System explorer. */
import { h, fitCanvas } from '../dom.js';
import { utc } from '../fmt.js';
import { starField, drawBody } from '../render.js';
import { helioState } from '../../core/ephem.js';
import { AU } from '../../core/constants.js';
import { vyomNote } from '../guide.js';

export const LABS = [
  { id: 'galileo', year: 1610, title: 'Weigh Jupiter like Galileo', who: 'Galileo Galilei · Kepler’s 3rd law', desc: 'Track Io across real nights and use its orbit to measure Jupiter’s mass.' },
  { id: 'exoplanet', year: 1995, title: 'Find the first exoplanet', who: 'Mayor & Queloz · Nobel Prize 2019', desc: 'Fit the wobble of the star 51 Pegasi and discover a hot Jupiter.' },
  { id: 'gw', year: 2015, title: 'Hear two black holes collide', who: 'LIGO · GW150914', desc: 'Match the “chirp” of gravitational waves and weigh the black holes.' },
  { id: 'blackhole', year: 2019, title: 'Weigh the black hole in M87', who: 'Event Horizon Telescope', desc: 'Measure the shadow in the first black-hole image to find its mass.' },
];

export function expertScreen(app) {
  const missions = app.content.missions;
  const sky = h('canvas', { 'aria-hidden': 'true' });
  const clock = h('div.clock');
  const stars = starField(500, 3);
  let raf = 0;
  const draw = () => {
    const { w, h: hh, ctx } = fitCanvas(sky);
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, hh);
    stars(ctx, w, hh);
    // real inner Solar System right now (top-down, Sun at right)
    const now = new Date();
    const cx = w * 0.84, cy = hh * 0.5, s = Math.min(w * 0.15, hh * 0.36) / (1.6 * AU);
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
      if (b === 'earth') {
        ctx.fillStyle = '#4cc9f0';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillText('Earth', x - 12, y - 8);
      }
    }
    clock.textContent = utc(now) + ' · planets at their real positions';
  };
  const done = (id) => app.save.missions[id]?.stars || 0;
  const card = (m) =>
    h(
      'button.mcard',
      { 'data-testid': 'mission-' + m.id, onclick: () => app.go('briefing', { id: m.id }) },
      h('div.yr', { 'aria-hidden': 'true' }, String(m.year)),
      h('div.row', h('span.chip.' + (m.agency.startsWith('ISRO') ? 'isro' : 'nasa'), m.agency), h('span.diff', '●'.repeat(m.difficulty) + '○'.repeat(3 - m.difficulty))),
      h('div.t', m.title),
      h('div.d', m.goal),
      h('div.foot', h('span.small.muted', m.craft), done(m.id) ? h('span.stars', { 'aria-label': `${done(m.id)} stars` }, '★'.repeat(done(m.id)) + '☆'.repeat(3 - done(m.id))) : h('span.small.muted', 'Not flown')),
    );
  const isro = missions.filter((m) => m.agency.startsWith('ISRO'));
  const other = missions.filter((m) => !m.agency.startsWith('ISRO'));
  const labCard = (l) =>
    h(
      'button.mcard',
      { 'data-testid': 'lab-' + l.id, onclick: () => app.go('lab', { id: l.id }) },
      h('div.yr', { 'aria-hidden': 'true' }, String(l.year)),
      h('div.row', h('span.chip', 'Discovery lab')),
      h('div.t', l.title),
      h('div.d', l.desc),
      h('div.foot', h('span.small.muted', l.who), app.save.labs[l.id] ? h('span.ok.small', 'Done') : h('span.small.muted', 'Open')),
    );
  const el = h(
    'div.screen',
    h(
      'div.hero',
      sky,
      h('div.inner', h('div.row', h('button.btn.icon.sm', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('div.label', 'Expert mode')), h('h1', 'Full missions'), h('p', { style: { maxWidth: '40ch' } }, 'Plan every burn yourself, on the real dates, with the real spacecraft. For experienced pilots.'), clock),
    ),
    vyomNote('These are the full missions, on their real dates. You plan every burn yourself. Stuck? Press Mission Assist and I’ll plan it for you!', 'happy'),
    h('div.row.wrap', h('button.btn.primary', { onclick: () => app.go('explorer') }, 'Solar System now'), h('button.btn', { onclick: () => app.go('about') }, 'How the physics works')),
    h('div.section', h('h3', 'ISRO missions'), h('span.small.muted', 'India’s journey to the Moon, Mars and the Sun')),
    h('div.cards', isro.map(card)),
    h('div.section', h('h3', 'NASA history'), h('span.small.muted', 'Missions that changed exploration')),
    h('div.cards', other.map(card)),
    h('div.section', h('h3', 'Discovery labs'), h('span.small.muted', 'Real data, real formulas')),
    h(
      'div.cards',
      h(
        'button.mcard.sandbox-card',
        { 'data-testid': 'lab-sandbox', onclick: () => app.go('sandbox') },
        h('div.yr', { 'aria-hidden': 'true' }, 'Free'),
        h('div.row', h('span.chip', 'Sandbox')),
        h('div.t', 'Orbit Sandbox'),
        h('div.d', 'Choose a world, a height, a speed and an engine, then fly. Find orbital speed, escape speed and transfer orbits yourself.'),
        h('div.foot', h('span.small.muted', 'Newton · Kepler · Oberth'), h('span.small.muted', 'Open')),
      ),
      LABS.map(labCard),
    ),
    h('p.small.muted', { style: { marginTop: '18px' } }, 'Stuck? Mission Assist can plan any burn for you. Every mission shows its real history and sources, and states every simplification.'),
  );
  return {
    el,
    tour: [
      { sel: '.cards', title: 'Expert missions', text: 'Full missions on their real dates, with step-by-step guides. Fly all of them to reach Grandmaster.' },
      { sel: '.cards ~ .cards, .section ~ .cards', title: 'Discovery labs', text: 'Labs and the Orbit Sandbox let you change gravity, speed and height and see what happens.' },
    ],
    mounted() {
      const loop = () => {
        draw();
        raf = setTimeout(loop, 1000);
      };
      loop();
    },
    destroy: () => clearTimeout(raf),
  };
}
