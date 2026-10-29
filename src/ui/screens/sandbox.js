/**
 * Orbit Sandbox: pick a world, set the starting height, speed, direction and
 * engine, then fly freely with BOOST and BRAKE. Same physics engine as the
 * levels (Newtonian gravity, finite burns, rocket equation, Dormand–Prince),
 * with no goal: just experiments.
 */
import { h, clear, put, fitCanvas } from '../dom.js';
import { orbitalGame, orbitClock } from '../../arcade/levels.js';
import { createRenderer } from '../../arcade/draw.js';
import { MU, RADIUS_EQ, G0 } from '../../core/constants.js';
import { progress } from '../../game/progress.js';
import { vyomSVG } from '../guide.js';
import { sfx, boostOn, boostOff, setMood, unlockAudio } from '../audio.js';

const WORLDS = [
  { id: 'earth', name: 'Earth' },
  { id: 'moon', name: 'Moon' },
  { id: 'mars', name: 'Mars' },
  { id: 'jupiter', name: 'Jupiter' },
];
const ISP = 320, DRY = 400;
const TRY = [
  'Set speed to 100% and launch: a perfect circle. That is orbital speed.',
  'Try 141% speed. That is escape speed (√2 times orbital): you never come back!',
  'Below 100% you fall into an oval. Too slow and you hit the ground.',
  'Hold BOOST at the lowest point and watch the far side of the orbit rise. That is the Oberth effect.',
  'Transfer orbit: BOOST at the low point, coast to the high point, then BOOST again to make it round.',
  'Try the same orbit around the Moon and Jupiter. Heavier worlds need much more speed.',
];

const fmtKm = (m) => (Math.abs(m) >= 1e7 ? `${Math.round(m / 1000).toLocaleString('en-US')} km` : `${Math.round(m / 1000).toLocaleString('en-US')} km`);
const fmtV = (v) => (v >= 10000 ? `${(v / 1000).toFixed(1)} km/s` : v >= 1000 ? `${(v / 1000).toFixed(2)} km/s` : `${Math.round(v)} m/s`);
const fmtT = (s) => (!isFinite(s) ? 'none' : s >= 2 * 86400 ? `${(s / 86400).toFixed(1)} days` : s >= 5400 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

export function sandboxScreen(app) {
  const prog = progress(app);
  const skin = prog.skin();
  const renderer = createRenderer();
  const set = { world: 'earth', hpos: 0, speed: 100, angle: 0, push: 2, fuel: 3000 };
  const heightOf = (R, v) => 0.03 * R * Math.pow(200, v / 1000);
  set.hpos = Math.round((1000 * Math.log(400e3 / (0.03 * RADIUS_EQ.earth))) / Math.log(200));
  let game = null, cfg = null, raf = 0, last = 0, mult = 1, flying = false, hold = 0, tip = 0, camMode = 'auto';

  const canvas = h('canvas.play-canvas', { 'aria-label': 'Orbit sandbox view' });
  const stats = h('div.sb-stats');
  const msg = h('div.sb-msg', { 'aria-live': 'polite' });

  /* ---------- setup panel ---------- */
  const worldPills = h('div.filters', { role: 'group', 'aria-label': 'World' });
  const slider = (label, key, min, max, step, fmt) => {
    const out = h('span.sb-val');
    const inp = h('input', { type: 'range', min, max, step, value: set[key], 'aria-label': label, 'data-testid': 'sb-' + key });
    const paint = () => (out.textContent = fmt(set[key]));
    inp.addEventListener('input', () => ((set[key] = +inp.value), paint(), preview()));
    paint();
    return { el: h('label.sb-slider', h('span.sb-lab', label, out), inp), paint, inp };
  };
  const R = () => RADIUS_EQ[set.world];
  const mu = () => MU[set.world];
  const r0 = () => R() + heightOf(R(), set.hpos);
  const vCirc = () => Math.sqrt(mu() / r0());
  const sH = slider('Start height', 'hpos', 0, 1000, 1, () => fmtKm(heightOf(R(), set.hpos)));
  const sV = slider('Start speed', 'speed', 50, 160, 1, (p) => `${p}% of orbital · ${fmtV((vCirc() * p) / 100)}`);
  const sA = slider('Direction', 'angle', -30, 30, 1, (a) => (a === 0 ? 'level (sideways)' : `${Math.abs(a)}° ${a > 0 ? 'upwards' : 'downwards'}`));
  const sP = slider('Engine push', 'push', 0.2, 20, 0.2, (a) => `${a.toFixed(1)} m/s²`);
  const sF = slider('Fuel', 'fuel', 500, 8000, 100, (d) => `${fmtV(d)} of Δv`);
  const prevEl = h('p.small.muted.sb-preview');
  function preview() {
    sV.paint();
    prevEl.textContent = `Orbital speed here: ${fmtV(vCirc())} · escape speed: ${fmtV(vCirc() * Math.SQRT2)}`;
  }
  for (const wd of WORLDS)
    worldPills.appendChild(
      h('button.pill', { 'data-w': wd.id, 'aria-pressed': String(set.world === wd.id), 'data-testid': 'sb-world-' + wd.id, onclick: () => ((set.world = wd.id), [...worldPills.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === wd.id))), sH.paint(), preview(), sfx.tap()) }, wd.name),
    );
  preview();
  const setup = h(
    'div.sb-setup',
    h('div.sb-setup-head', h('b', 'Set up your experiment')),
    worldPills,
    sH.el,
    sV.el,
    prevEl,
    sA.el,
    sP.el,
    sF.el,
    h('button.btn.primary.block', { 'data-testid': 'sb-launch', onclick: () => (unlockAudio(), sfx.tap(), launch()) }, 'Launch ▸'),
  );

  /* ---------- flight controls ---------- */
  const holdBtn = (label, dir, id) => {
    const b = h('button.big-btn.sb-btn', { 'data-testid': id }, h('span.big-label', label));
    const on = (e) => (e.preventDefault(), flying && ((hold = dir), b.classList.add('pressed')));
    const off = () => (hold === dir && (hold = 0), b.classList.remove('pressed'));
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
    return b;
  };
  const brakeBtn = holdBtn('BRAKE', -1, 'sb-brake');
  const boostBtn = holdBtn('BOOST', 1, 'sb-boost');
  const speedBtn = h('button.btn.sm', { 'data-testid': 'sb-time', onclick: () => ((mult = mult === 1 ? 4 : mult === 4 ? 16 : 1), paintSpeed(), sfx.tap()) });
  const paintSpeed = () => (speedBtn.textContent = `Time ×${mult}`);
  paintSpeed();
  const camBtn = h('button.btn.sm', { onclick: () => ((camMode = camMode === 'auto' ? 'follow' : 'auto'), (camBtn.textContent = camMode === 'auto' ? 'View: Orbit' : 'View: Follow'), sfx.tap()) }, 'View: Orbit');
  const tipEl = h('div.sb-tip');
  const paintTip = () => {
    clear(tipEl);
    const face = h('span.toast-vyom');
    face.innerHTML = vyomSVG('happy', 32);
    put(tipEl, face, h('span', h('b', 'Try this: '), TRY[tip]), h('button.btn.sm.ghost', { 'aria-label': 'Next idea', onclick: () => ((tip = (tip + 1) % TRY.length), paintTip(), sfx.tap()) }, 'Next'));
  };
  paintTip();
  const controls = h(
    'div.sb-controls',
    tipEl,
    h('div.row.wrap.sb-small', h('button.btn.sm', { 'data-testid': 'sb-setup', onclick: () => openSetup() }, 'Set up'), h('button.btn.sm', { onclick: () => launch() }, '↺ Restart'), speedBtn, camBtn),
    h('div.sb-big', brakeBtn, boostBtn),
  );

  const el = h(
    'div.screen.full.play.sandbox',
    canvas,
    h('div.play-top', h('button.btn.icon.sm.ghost', { 'aria-label': 'Back', onclick: () => app.go('expert') }, '←'), h('div.play-title', h('div.lvl', 'Discovery lab · real physics'), h('div.t', 'Orbit Sandbox'))),
    h('div.play-hud', stats, msg),
    h('div.play-bottom', controls),
    setup,
  );

  function openSetup() {
    flying = false;
    hold = 0;
    boostOff();
    setup.hidden = false;
    controls.hidden = true;
  }

  function launch() {
    const Rb = R(), m = mu(), r = r0();
    const v = (vCirc() * set.speed) / 100, g = (set.angle * Math.PI) / 180;
    const wet = DRY * Math.exp(set.fuel / (ISP * G0));
    const world = { central: { name: set.world, mu: m, R: Rb }, bodies: [], ship: { x: 0, y: r, vx: -v * Math.cos(g), vy: v * Math.sin(g), mass: wet, dry: DRY, thrust: set.push * wet, isp: ISP }, hmax: 600 };
    const clk = orbitClock(m, 12);
    cfg = {
      world,
      dir: 'pro',
      clock: (rr) => clk(Math.min(rr, 40 * Rb)) * mult,
      burnSlow: 0.5,
      clockR: (gg) => Math.hypot(gg.w.y[0], gg.w.y[1]),
      horizon: (gg) => {
        const o = gg.w.orbitAbout(set.world);
        return o.energy < 0 ? Math.min(o.period * 1.02, 4 * 86400 * 30) : (30 * Rb) / Math.max(o.v, 1);
      },
      trailStep: Rb * 0.02,
      check(gg) {
        const o = gg.w.orbitAbout(set.world);
        if (o.energy >= 0 && o.r > 60 * Rb && !gg.burning) gg.win(1, []);
      },
      onHit: (gg) => gg.lose('crash'),
      info: () => [],
      scene: (gg) => {
        const f = [[Rb * 1.3, 0], [-Rb * 1.3, 0], [0, Rb * 1.3], [0, -Rb * 1.3]];
        const p = gg.pred?.path || [];
        for (let i = 0; i < p.length; i += 30) f.push([p[i], p[i + 1]]);
        return { central: set.world, bodies: [], keepWide: true, noInset: true, focus: f };
      },
      bot: () => ({}),
    };
    game = orbitalGame(cfg);
    setup.hidden = true;
    controls.hidden = false;
    flying = true;
    clear(msg);
    setMood('play');
  }

  function readouts() {
    clear(stats);
    if (!game) return;
    const o = game.w.orbitAbout(set.world);
    const Rb = R();
    const bound = o.energy < 0;
    const rows = [
      ['Height', fmtKm(o.r - Rb)],
      ['Speed', fmtV(o.v)],
      ['Near point', fmtKm(o.peri - Rb)],
      ['Far point', bound ? fmtKm(o.apo - Rb) : 'escaping'],
      ['Shape (e)', o.e.toFixed(3)],
      ['One orbit', bound ? fmtT(o.period) : 'none'],
      ['Fuel left', fmtV(ISP * G0 * Math.log(game.w.y[4] / DRY))],
      ['Escape here', fmtV(Math.sqrt((2 * mu()) / o.r))],
    ];
    put(stats, rows.map(([k, v]) => h('div.chip-stat', h('span.k', k), h('span.v', v))));
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (game && flying && game.status === 'play' && !document.hidden) {
      cfg.dir = hold < 0 ? 'retro' : 'pro';
      game.update(dt, { hold: hold !== 0 });
      if (game.burning) boostOn();
      else boostOff();
      if (game.status !== 'play') {
        flying = false;
        boostOff();
        clear(msg);
        if (game.status === 'lost') {
          sfx.crash();
          put(msg, h('div.coach', h('b', 'Crashed! '), 'Your path dipped into the surface. Go faster sideways, or BOOST at the high point to lift the low point.'));
        } else {
          sfx.win();
          put(msg, h('div.coach', h('b', 'Escaped! '), `You left ${WORLDS.find((x) => x.id === set.world).name}’s gravity for good: your energy is now positive.`));
        }
      }
    }
    const r = fitCanvas(canvas);
    if (game) {
      const top = el.querySelector('.play-hud')?.getBoundingClientRect().bottom ?? 120;
      const bottom = (setup.hidden ? el.querySelector('.play-bottom') : setup)?.getBoundingClientRect().top ?? r.h - 120;
      renderer.draw(r.ctx, r.w, r.h, game, skin, { top, bottom, dpr: r.dpr, camMode });
    } else {
      r.ctx.fillStyle = '#04060b';
      r.ctx.fillRect(0, 0, r.w, r.h);
    }
    readouts();
  }

  return {
    el,
    tour: [{ title: 'Orbit Sandbox', text: 'Pick a world, set the height and speed, and launch. Find the speed that gives a perfect circle, or the one that escapes.' }],
    mounted() {
      controls.hidden = true;
      launch();
      openSetup();
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      cancelAnimationFrame(raf);
      boostOff();
    },
    onPause() {
      hold = 0;
      boostOff();
    },
    get game() {
      return game;
    },
  };
}
