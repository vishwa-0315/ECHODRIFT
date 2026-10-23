/** Practice Sandbox: drop planets/moons, fling the ship, play freely with gravity. No score. */
import { h, fitCanvas } from '../dom.js';
import { t } from '../i18n.js';
import { createWorld, stepShip, hitBody, predictPath, DT } from '../../core/physics.js';
import { drawBody } from '../art.js';
import { topbar } from './common.js';

const KINDS = {
  small: { mass: 15000, radius: 18, color: '#9a8f99', type: 'moon' },
  planet: { mass: 60000, radius: 34, color: '#4fc3f7', type: 'planet' },
  star: { mass: 220000, radius: 48, color: '#ffd25e', type: 'star' },
};

export function sandboxScreen(app) {
  const W = 600;
  const H = 900;
  let bodies = [{ id: 'b0', ...KINDS.planet, x: 300, y: 420 }];
  let world = createWorld({ bodies });
  let ship = null;
  let trail = [];
  let mode = 'planet';
  let aim = null;
  let raf = 0;
  let last = 0;
  let acc = 0;
  const canvas = h('canvas', { style: { width: '100%', flex: 1, minHeight: '320px', borderRadius: '16px', border: '1px solid var(--line)', touchAction: 'none', background: '#070818' }, role: 'img', 'aria-label': t('sb.aria') });
  let view = { s: 1, ox: 0, oy: 0 };
  const toWorld = (x, y) => ({ x: (x - view.ox) / view.s, y: (y - view.oy) / view.s });
  const toScreen = (x, y) => ({ x: view.ox + x * view.s, y: view.oy + y * view.s });

  const modeBtns = h('div.seg', { role: 'group', 'aria-label': t('sb.place') });
  const drawModes = () => {
    modeBtns.innerHTML = '';
    for (const [k, l] of [
      ['small', '🌑 ' + t('sb.moon')],
      ['planet', '🪐 ' + t('sb.planet')],
      ['star', '⭐ ' + t('sb.star')],
      ['ship', '🚀 ' + t('sb.ship')],
    ])
      modeBtns.appendChild(h('button', { 'aria-pressed': mode === k ? 'true' : 'false', onclick: () => ((mode = k), drawModes()) }, l));
  };
  drawModes();

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = toWorld(e.clientX - r.left, e.clientY - r.top);
    if (mode === 'ship') {
      aim = { x: p.x, y: p.y, cx: p.x, cy: p.y };
      canvas.setPointerCapture?.(e.pointerId);
    } else {
      if (bodies.length >= 6) return app.toast(t('sb.max'));
      bodies.push({ id: 'b' + Date.now(), ...KINDS[mode], x: p.x, y: p.y });
      world = createWorld({ bodies });
      app.sfx('boing');
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!aim) return;
    const r = canvas.getBoundingClientRect();
    const p = toWorld(e.clientX - r.left, e.clientY - r.top);
    aim.cx = p.x;
    aim.cy = p.y;
  });
  canvas.addEventListener('pointerup', () => {
    if (!aim) return;
    ship = { x: aim.x, y: aim.y, vx: (aim.x - aim.cx) * 0.6, vy: (aim.y - aim.cy) * 0.6, t: 0 };
    trail = [];
    aim = null;
    app.sfx('burn', 0.5);
  });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const { w, h: hh, ctx } = fitCanvas(canvas);
    view.s = Math.min(w / W, hh / H);
    view.ox = (w - W * view.s) / 2;
    view.oy = (hh - H * view.s) / 2;
    if (ship && !document.hidden) {
      acc += dt * 1.4;
      while (acc >= DT) {
        stepShip(world, ship);
        acc -= DT;
        if (hitBody(world, ship)) {
          app.sfx('boom');
          app.haptic(40);
          ship = null;
          break;
        }
      }
      if (ship) {
        trail.push(ship.x, ship.y);
        if (trail.length > 1200) trail.splice(0, 2);
        if (Math.abs(ship.x - W / 2) > W * 3 || Math.abs(ship.y - H / 2) > H * 3) ship = null;
      }
    }
    ctx.fillStyle = '#070818';
    ctx.fillRect(0, 0, w, hh);
    for (const b of world.bodies) {
      const p = toScreen(b.x, b.y);
      drawBody(ctx, p.x, p.y, b.radius * view.s, b.color, b.type);
    }
    ctx.strokeStyle = 'rgba(255,192,77,.6)';
    ctx.beginPath();
    for (let i = 0; i < trail.length; i += 2) {
      const p = toScreen(trail[i], trail[i + 1]);
      ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y);
    }
    ctx.stroke();
    if (aim) {
      const pts = predictPath(world, { x: aim.x, y: aim.y, vx: (aim.x - aim.cx) * 0.6, vy: (aim.y - aim.cy) * 0.6, t: 0 }, 4, 6);
      ctx.strokeStyle = '#3ff0d2';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const p = toScreen(pts[i], pts[i + 1]);
        ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y);
      }
      ctx.stroke();
    }
    if (ship) {
      const p = toScreen(ship.x, ship.y);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const el = h(
    'div.screen',
    topbar(app, t('nav.sandbox')),
    h('p.small.muted', t('sb.how')),
    modeBtns,
    h('div', { style: { height: '8px' } }),
    canvas,
    h('div.row', { style: { marginTop: '8px' } }, h('button.btn.grow', { onclick: () => ((bodies = []), (world = createWorld({ bodies })), (ship = null), (trail = [])) }, '🧹 ', t('sb.clear'))),
  );
  return { el, mounted: () => (raf = requestAnimationFrame(frame)), destroy: () => cancelAnimationFrame(raf) };
}
