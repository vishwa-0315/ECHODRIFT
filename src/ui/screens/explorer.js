/** The real Solar System on any date, plus the next real launch window to Mars. */
import { h, clear, put, fitCanvas } from '../dom.js';
import { helioState } from '../../core/ephem.js';
import { lambert } from '../../core/orbit.js';
import { AU, C, DAY, MU } from '../../core/constants.js';
import { drawBody, starField } from '../render.js';
import { dist } from '../fmt.js';
import { vyomNote } from '../guide.js';

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const FACTS = {
  mercury: 'Smallest planet. A year lasts 88 days.',
  venus: 'Hottest planet (about 465 °C) because of its thick CO₂ air.',
  earth: 'The only world known to have life… so far.',
  mars: 'ISRO’s Mangalyaan orbited Mars from 2014 to 2022.',
  jupiter: 'More than twice as massive as all the other planets combined.',
  saturn: 'Its rings are mostly water ice, but very thin, often tens of metres thick.',
  uranus: 'Spins on its side. Only Voyager 2 has visited it (1986).',
  neptune: 'Found by mathematics in 1846, predicted from Uranus’s wobbles before anyone saw it.',
};

export function explorerScreen(app) {
  let date = new Date();
  let logScale = true;
  let sel = 'mars';
  const stars = starField(600, 9);
  const canvas = h('canvas.chart', { style: { height: '56vh', minHeight: '320px' }, role: 'img', 'aria-label': 'Top-down view of the Solar System' });
  const info = h('div.panel');
  const dateLbl = h('div.clock');
  const slider = h('input', { type: 'range', min: -3650, max: 3650, value: 0, style: { flex: 1 }, 'aria-label': 'Days from today' });
  slider.oninput = () => ((date = new Date(Date.now() + slider.value * DAY * 1000)), draw(), panel());
  const R = (r) => (logScale ? Math.log10(1 + (r / AU) * 9) / Math.log10(1 + 31 * 9) : r / (31 * AU));
  function draw() {
    const { w, h: H, ctx } = fitCanvas(canvas);
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, H);
    stars(ctx, w, H);
    const cx = w / 2, cy = H / 2, s = Math.min(w, H) * 0.47;
    drawBody(ctx, 'sun', cx, cy, 7);
    canvas._pos = {};
    for (const b of PLANETS) {
      const p = helioState(b, date);
      const r = Math.hypot(p.x, p.y);
      ctx.strokeStyle = 'rgba(141,156,181,0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, R(r) * s, 0, Math.PI * 2);
      ctx.stroke();
      const x = cx + (p.x / r) * R(r) * s, y = cy - (p.y / r) * R(r) * s;
      drawBody(ctx, b, x, y, b === 'jupiter' || b === 'saturn' ? 6 : 4, Math.atan2(cy - y, cx - x), { minR: 4 });
      ctx.fillStyle = b === sel ? '#ff9933' : '#c9d4e6';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillText(b[0].toUpperCase() + b.slice(1), x + 8, y + 4);
      canvas._pos[b] = { x, y };
      if (b === sel) {
        ctx.strokeStyle = '#ff9933';
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    dateLbl.textContent = date.toISOString().slice(0, 10) + (Math.abs(slider.value) < 1 ? ' (today)' : '') + (logScale ? ' · distances compressed (log scale)' : ' · true distances');
  }
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    let best = null, bd = 30;
    for (const [b, p] of Object.entries(canvas._pos || {})) {
      const d = Math.hypot(p.x - (e.clientX - r.left), p.y - (e.clientY - r.top));
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best) {
      sel = best;
      draw();
      panel();
    }
  });
  function panel() {
    const p = helioState(sel, date);
    const e = helioState('earth', date);
    const dSun = Math.hypot(p.x, p.y, p.z);
    const dEarth = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    clear(info);
    put(
      info,
      h('h2', sel[0].toUpperCase() + sel.slice(1)),
      h('table.spec', h('tbody', [
        ['Distance from Sun', dist(dSun)],
        sel !== 'earth' ? ['Distance from Earth', `${dist(dEarth)}`] : null,
        sel !== 'earth' ? ['A radio signal takes', `${(dEarth / C / 60).toFixed(1)} minutes`] : null,
        ['Orbital speed', `${(Math.hypot(p.vx, p.vy, p.vz) / 1000).toFixed(1)} km/s`],
      ].filter(Boolean).map(([k, v]) => h('tr', h('td', k), h('td', v))))),
      h('p.small', { style: { marginTop: '8px' } }, FACTS[sel]),
    );
  }
  const winOut = h('div.small');
  function nextWindow() {
    clear(winOut);
    let best = null;
    const t0 = Date.now();
    for (let d = 0; d < 3 * 365; d += 6) {
      const dep = t0 + d * DAY * 1000;
      const e = helioState('earth', new Date(dep));
      for (let tof = 180; tof <= 320; tof += 20) {
        const m = helioState('mars', new Date(dep + tof * DAY * 1000));
        const sol = lambert([e.x, e.y], [m.x, m.y], tof * DAY, MU.sun);
        if (!sol) continue;
        const c3 = ((sol.v1[0] - e.vx) ** 2 + (sol.v1[1] - e.vy) ** 2) / 1e6;
        if (!best || c3 < best.c3) best = { dep, tof, c3 };
      }
    }
    put(winOut, h('p', h('b', `Next cheapest Earth → Mars departure: around ${new Date(best.dep).toISOString().slice(0, 10)}`), `, arriving after about ${best.tof} days (C3 ≈ ${best.c3.toFixed(1)} km²/s²). Computed just now from the planets’ real positions.`));
  }
  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', 'The Solar System, really')),
    vyomNote('These are the planets where they really are today. Drag the slider to travel 10 years either way, and tap a planet to learn about it!'),
    canvas,
    h('div.row', { style: { marginTop: '8px' } }, h('span.small.muted', '−10 yr'), slider, h('span.small.muted', '+10 yr')),
    h('div.row.wrap', dateLbl, h('div.spacer'), h('button.btn.sm', { onclick: () => ((slider.value = 0), slider.oninput()) }, 'Today'), h('button.btn.sm', { onclick: () => ((logScale = !logScale), draw()) }, 'Toggle scale')),
    info,
    h('div', { style: { height: '8px' } }),
    h('button.btn', { onclick: () => app.busy('Searching real launch windows…', nextWindow) }, '🚀 When is the next Mars launch window?'),
    winOut,
  );
  return { el, mounted: () => (draw(), panel()) };
}
