/**
 * The real Solar System on any date: planets at their real positions, the
 * Sun's habitable zone, full facts for every planet, its main moons, the live
 * distance between any two planets, and the next real launch window to Mars.
 */
import { h, clear, put, fitCanvas } from '../dom.js';
import { helioState } from '../../core/ephem.js';
import { lambert } from '../../core/orbit.js';
import { AU, C, DAY, MU } from '../../core/constants.js';
import { drawBody, starField } from '../render.js';
import { vyomNote } from '../guide.js';
import data from '../../../content/planets.json';

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const NAME = (b) => b[0].toUpperCase() + b.slice(1);
const nf = (x, d = 0) => Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const kmText = (m) => (m > 1e9 ? `${nf(m / 1e9, 1)} million km` : `${nf(m / 1e3)} km`);

export function explorerScreen(app) {
  let date = new Date();
  let logScale = true;
  let sel = 'mars';
  let tab = 'facts';
  let other = 'earth';
  const stars = starField(600, 9);
  const canvas = h('canvas.chart', { style: { height: '52vh', minHeight: '300px' }, role: 'img', 'aria-label': 'Top-down view of the Solar System, with the habitable zone' });
  const info = h('div.panel.sx-panel');
  const dateLbl = h('div.clock');
  const slider = h('input', { type: 'range', min: -3650, max: 3650, value: 0, style: { flex: 1 }, 'aria-label': 'Days from today' });
  slider.oninput = () => ((date = new Date(Date.now() + slider.value * DAY * 1000)), draw(), panel());
  const R = (r) => (logScale ? Math.log10(1 + (r / AU) * 9) / Math.log10(1 + 31 * 9) : r / (31 * AU));
  const chips = h('div.sx-chips', PLANETS.map((b) => h('button.chip.sx-chip', { 'data-p': b, onclick: () => pick(b) }, NAME(b))));

  function pick(b) {
    sel = b;
    if (other === sel) other = sel === 'earth' ? 'mars' : 'earth';
    draw();
    panel();
  }

  function draw() {
    const { w, h: H, ctx } = fitCanvas(canvas);
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, H);
    stars(ctx, w, H);
    const cx = w / 2, cy = H / 2, s = Math.min(w, H) * 0.47;
    // habitable zone: where a planet like Earth could keep liquid water
    const hz = data.habitableZoneAU;
    const r1 = R(hz.inner * AU) * s, r2 = R(hz.outer * AU) * s;
    ctx.fillStyle = 'rgba(82,210,115,0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, r2, 0, Math.PI * 2);
    ctx.arc(cx, cy, r1, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.fillStyle = 'rgba(82,210,115,0.9)';
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.fillText('Habitable zone', cx - 34, cy + r2 + 12);
    drawBody(ctx, 'sun', cx, cy, 7);
    canvas._pos = {};
    const pos = {};
    for (const b of PLANETS) {
      const p = helioState(b, date);
      const r = Math.hypot(p.x, p.y);
      ctx.strokeStyle = 'rgba(141,156,181,0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, R(r) * s, 0, Math.PI * 2);
      ctx.stroke();
      pos[b] = { x: cx + (p.x / r) * R(r) * s, y: cy - (p.y / r) * R(r) * s };
    }
    // distance line between the two chosen planets
    if (tab === 'distance') {
      ctx.strokeStyle = 'rgba(76,201,240,0.9)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos[sel].x, pos[sel].y);
      ctx.lineTo(pos[other].x, pos[other].y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
    for (const b of PLANETS) {
      const { x, y } = pos[b];
      drawBody(ctx, b, x, y, b === 'jupiter' || b === 'saturn' ? 6 : 4, Math.atan2(cy - y, cx - x), { minR: 4 });
      ctx.fillStyle = b === sel ? '#ff9933' : b === other && tab === 'distance' ? '#4cc9f0' : '#c9d4e6';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillText(NAME(b), x + 8, y + 4);
      canvas._pos[b] = { x, y };
      if (b === sel) {
        ctx.strokeStyle = '#ff9933';
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    dateLbl.textContent = date.toISOString().slice(0, 10) + (Math.abs(slider.value) < 1 ? ' (today)' : '') + (logScale ? ' · distances squeezed (log scale)' : ' · true distances');
    chips.querySelectorAll('.sx-chip').forEach((c) => c.classList.toggle('on', c.dataset.p === sel));
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
    if (best) pick(best);
  });

  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  function panel() {
    const P = data.planets[sel];
    const p = helioState(sel, date);
    const e = helioState('earth', date);
    const dSun = Math.hypot(p.x, p.y, p.z);
    const hz = data.habitableZoneAU;
    const inHZ = dSun / AU >= hz.inner && dSun / AU <= hz.outer;
    clear(info);
    const tabs = h(
      'div.seg.sx-tabs',
      [['facts', 'Facts'], ['moons', `Moons (${P.moons})`], ['distance', 'Distances']].map(([id, label]) => h('button', { 'aria-pressed': tab === id ? 'true' : 'false', onclick: () => ((tab = id), panel(), draw()) }, label)),
    );
    let body;
    if (tab === 'facts') {
      body = h(
        'div',
        h('table.spec', h('tbody', [
          ['Type', P.type],
          ['Diameter', `${nf(P.diameterKm)} km (${nf(P.diameterKm / 12756, 2)} × Earth)`],
          ['Mass', `${nf(P.massEarth, P.massEarth < 1 ? 3 : 1)} × Earth`],
          ['Gravity', `${P.gravity} m/s² (${nf(P.gravity / 9.8, 2)} × Earth)`],
          ['Escape speed', `${P.escape} km/s`],
          ['Length of day', P.day],
          ['Length of year', P.year],
          ['Average distance from Sun', `${nf(P.distanceAU, 3)} AU (${nf((P.distanceAU * AU) / 1e9, 1)} million km)`],
          ['Distance from Sun now', `${nf(dSun / AU, 3)} AU`],
          sel !== 'earth' ? ['Distance from Earth now', `${kmText(dist3(p, e))} · light takes ${nf(dist3(p, e) / C / 60, 1)} min`] : null,
          ['Temperature', P.tempC],
          ['Air', P.atmosphere],
          ['Known moons', P.moons],
          ['In the habitable zone?', inHZ ? 'Yes' : 'No'],
        ].filter(Boolean).map(([k, v]) => h('tr', h('td', k), h('td', v))))),
        h('p.small', { style: { marginTop: '8px' } }, P.fact),
      );
    } else if (tab === 'moons') {
      const list = data.moons[sel] || [];
      body = list.length
        ? h(
            'div.sx-moons',
            h('p.small.muted', `The main moons of ${NAME(sel)}${P.moons !== String(list.length) ? ` (it has ${P.moons} in all)` : ''}:`),
            list.map((m) => h('div.sx-moon', h('div.b', m.name), h('div.small', `${nf(m.diameterKm, m.diameterKm < 100 ? 1 : 0)} km wide · ${nf(m.distanceKm)} km from ${NAME(sel)} · one orbit: ${m.orbit}`), h('div.small.muted', m.fact))),
          )
        : h('p', `${NAME(sel)} has no moons.`);
    } else {
      const sp = helioState(sel, date), op = helioState(other, date);
      const d = dist3(sp, op);
      const sel2 = h('select.sx-select', { 'aria-label': 'Second planet', onchange: (ev) => ((other = ev.target.value), panel(), draw()) }, PLANETS.filter((b) => b !== sel).map((b) => h('option', { value: b, selected: b === other ? true : null }, NAME(b))));
      const rows = PLANETS.filter((b) => b !== sel).map((b) => [b, dist3(sp, helioState(b, date))]).sort((a, b) => a[1] - b[1]);
      const years = d / 1000 / 100 / 24 / 365.25;
      body = h(
        'div',
        h('div.row.wrap', h('b', NAME(sel)), h('span', '↔'), sel2),
        h('p', { style: { margin: '8px 0' } }, h('b.big', kmText(d)), h('br'), h('span.small', `${nf(d / AU, 2)} AU · radio signals take ${nf(d / C / 60, 1)} minutes · by car at 100 km/h: ${nf(years, 0)} years`)),
        h('div.label', `Distance from ${NAME(sel)} to every planet on this date`),
        h('table.spec', h('tbody', rows.map(([b, dd]) => h('tr', h('td', NAME(b)), h('td', `${kmText(dd)} (${nf(dd / AU, 2)} AU)`))))),
        h('p.small.muted', { style: { marginTop: '6px' } }, 'Planets move, so these distances change every day. Drag the date slider to watch them change.'),
      );
    }
    put(info, h('h2', NAME(sel)), tabs, body);
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
  const hz = data.habitableZoneAU;
  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', 'The Solar System, really')),
    vyomNote('These are the planets where they really are. The green band is the habitable zone. Tap a planet for its facts, moons and distances!'),
    canvas,
    h('div.row', { style: { marginTop: '8px' } }, h('span.small.muted', '−10 yr'), slider, h('span.small.muted', '+10 yr')),
    h('div.row.wrap', dateLbl, h('div.spacer'), h('button.btn.sm', { onclick: () => ((slider.value = 0), slider.oninput()) }, 'Today'), h('button.btn.sm', { onclick: () => ((logScale = !logScale), draw()) }, 'Toggle scale')),
    chips,
    info,
    h(
      'div.panel.sx-hz',
      h('h3', 'The habitable zone'),
      h('p.small', `The band around the Sun where a planet like Earth could keep liquid water on its surface: about ${hz.inner}–${hz.outer} AU (${nf(hz.inner * 149.6, 0)}–${nf(hz.outer * 149.6, 0)} million km). Too close and water boils away (Venus); too far and it freezes. Earth sits inside it. Mars is near the outer edge.`),
      h('p.small.muted', `Source: ${hz.source}. Planet data: ${data.source}`),
    ),
    h('div', { style: { height: '8px' } }),
    h('button.btn', { onclick: () => app.busy('Searching real launch windows…', nextWindow) }, 'When is the next Mars launch window?'),
    winOut,
  );
  return { el, mounted: () => (draw(), panel()) };
}
