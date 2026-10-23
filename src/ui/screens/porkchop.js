/** Mangalyaan step 1: choose a real launch window from a porkchop plot (Lambert solutions on real ephemerides). */
import { h, clear, put, fitCanvas } from '../dom.js';
import { porkchop } from '../../missions/orbital.js';
import { dv, kg } from '../fmt.js';
import { DAY } from '../../core/constants.js';

export function porkchopScreen(app, { id }) {
  const m = app.content.missions.find((x) => x.id === id);
  let grid = null;
  let pick = null;
  const canvas = h('canvas.chart', { style: { height: '320px' }, role: 'img', 'aria-label': 'Launch window chart. Departure date across, travel time up. Green cells are affordable.' });
  const info = h('div.panel', h('p.muted', 'Tap a cell to see what that launch would cost.'));
  const go = h('button.btn.primary.block', { disabled: true, 'data-testid': 'launch', onclick: () => app.go('orbital', { id, choice: { dep: pick.dep, tof: pick.tof } }) }, 'Launch in this window ▸');
  const real = { dep: Date.parse('2013-12-01T00:00:00Z'), tof: 297 };
  const W0 = m.physics.window;
  const t0 = Date.parse(W0.departFrom + 'T00:00:00Z');
  const t1 = Date.parse(W0.departTo + 'T00:00:00Z');

  function draw() {
    if (!grid) return;
    const { w, h: H, ctx } = fitCanvas(canvas);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, H);
    const L = 44, B = 30, R = 8, T = 10;
    const nx = grid.length, ny = grid[0].length;
    const cw = (w - L - R) / nx, ch = (H - T - B) / ny;
    grid.forEach((row, i) =>
      row.forEach((c, j) => {
        let col = '#1a2135';
        if (c) {
          const left = c.budget.left;
          col = left > 60 ? '#2f8f4e' : left > 20 ? '#52d273' : left > 5 ? '#ffcc4d' : left > -60 ? '#a8582a' : '#3a1d1d';
        }
        ctx.fillStyle = col;
        ctx.fillRect(L + i * cw, H - B - (j + 1) * ch, Math.ceil(cw), Math.ceil(ch));
      }),
    );
    // axes
    ctx.fillStyle = '#8d9cb5';
    ctx.font = '10px Inter, system-ui, sans-serif';
    for (let i = 0; i < nx; i += Math.ceil(nx / 5)) ctx.fillText(new Date(grid[i][0].dep).toISOString().slice(5, 10), L + i * cw, H - 12);
    for (let j = 0; j < ny; j += 4) ctx.fillText(grid[0][j]?.tof + ' d', 4, H - B - j * ch - 2);
    ctx.fillText('departure (2013–14) →', L, H - 1);
    ctx.save();
    ctx.translate(10, T + 80);
    ctx.rotate(-Math.PI / 2);
    ctx.restore();
    // real MOM marker
    const mx = L + ((real.dep - t0) / (t1 - t0)) * (w - L - R);
    const my = H - B - ((real.tof - W0.tofMin) / (W0.tofMax - W0.tofMin)) * (H - T - B);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText('real MOM', mx + 9, my - 6);
    if (pick) {
      const i = grid.findIndex((r) => r[0].dep === pick.dep);
      const j = grid[0].findIndex((c) => c.tof === pick.tof);
      ctx.strokeStyle = '#4cc9f0';
      ctx.strokeRect(L + i * cw, H - B - (j + 1) * ch, cw, ch);
    }
    canvas._geo = { L, B, R, T, cw, ch, nx, ny, H };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const g = canvas._geo;
    if (!g) return;
    const r = canvas.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - g.L) / g.cw);
    const j = Math.floor((g.H - g.B - (e.clientY - r.top)) / g.ch);
    const c = grid[i]?.[j];
    if (c) select(c);
  });
  function select(c) {
    pick = c;
    const b = c.budget;
    clear(info);
    put(
      info,
      h('div.row', h('b', `Depart ${new Date(c.dep).toISOString().slice(0, 10)}`), h('span.muted', `· arrive ${new Date(c.dep + c.tof * DAY * 1000).toISOString().slice(0, 10)} (${c.tof} days)`)),
      h('table.spec', h('tbody', [
        ['Leave Earth (C3)', `${c.c3.toFixed(1)} km²/s²`],
        ['Trans-Mars burn', `${dv(b.tmi)} → ${kg(b.propTMI)} fuel`],
        ['Arrive at Mars at', `${(c.vinf / 1000).toFixed(2)} km/s`],
        ['Mars capture burn', `≈ ${dv(b.moi)} → ${kg(b.propMOI)} fuel`],
        ['Fuel to spare', `${kg(b.left)}`],
      ].map(([k, v]) => h('tr', h('td', k), h('td', v))))),
      h('p', { class: b.ok ? 'ok' : 'no', style: { margin: '6px 0 0' } }, b.ok ? 'Affordable: Mangalyaan can do this.' : 'Not enough fuel: Mangalyaan could not be captured by Mars.'),
    );
    go.disabled = !b.ok;
    draw();
  }
  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('briefing', { id }) }, '←'), h('h2', 'Choose your launch window')),
    h('p', 'Earth and Mars line up for an affordable trip only once every 26 months. Each square is a real trajectory, computed from the planets’ real positions with Lambert’s problem. Green means Mangalyaan’s small fuel tank is enough.'),
    canvas,
    h('div.row.wrap.small.muted', { style: { margin: '6px 0' } }, h('span', '■ ', h('span', { style: { color: '#2f8f4e' } }, 'plenty')), h('span', '■ ', h('span', { style: { color: '#52d273' } }, 'ok')), h('span', '■ ', h('span', { style: { color: '#ffcc4d' } }, 'tight')), h('span', '■ ', h('span', { style: { color: '#a8582a' } }, 'not enough')), h('span', '○ the real 2013 choice')),
    info,
    h('div', { style: { height: '10px' } }),
    go,
  );
  return {
    el,
    async mounted() {
      grid = await app.busy('Computing 500 real trajectories…', () => porkchop(m, 4, 8));
      draw();
      const best = grid.flat().filter(Boolean).find((c) => Math.abs(c.dep - real.dep) < 2.1 * DAY * 1000 && Math.abs(c.tof - real.tof) <= 4);
      if (best) select(best);
    },
  };
}
