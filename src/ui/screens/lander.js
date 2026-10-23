/**
 * Powered landing (Apollo 11 Eagle, Chandrayaan-3 Vikram, Perseverance sky crane).
 * Throttle + tilt control, real engine limits, fuel callouts, hazard map.
 */
import { h, clear, put, fitCanvas } from '../dom.js';
import { buildLander, nearestSafe, isSafe } from '../../missions/landing.js';
import { guidance, terrainHeight } from '../../core/lander.js';
import { starField } from '../render.js';
import { kg } from '../fmt.js';

export function landerScreen(app, { id, handover }) {
  const m = app.content.missions.find((x) => x.id === id);
  const P = m.kind === 'edl' ? m.physics.lander : m.physics;
  const mars = m.kind === 'edl';
  let l;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let assistOn = false;
  let targetX = null;
  let tiltDir = 0;
  let ended = false;
  let calls = new Set();
  let hazardOn = false;
  let paused = false;
  const stars = starField(300, 5);
  const DT = 1 / 120;

  const canvas = h('canvas', { role: 'img', 'aria-label': 'Landing view. Tap the ground to choose a landing spot.' });
  const tele = h('div.tele');
  const callout = h('div.callout');
  const thr = h('input', { type: 'range', min: 0, max: 100, value: 0, 'aria-label': 'Throttle', 'data-testid': 'throttle' });
  const thrLbl = h('div.mono.small');
  const assistBtn = h('button.btn.sm', { onclick: () => toggleAssist(), 'data-testid': 'autoland' }, '✦ Assist: OFF');
  const hold = (dir) => ({
    onpointerdown: (e) => (e.preventDefault(), (tiltDir = dir)),
    onpointerup: () => (tiltDir = 0),
    onpointerleave: () => (tiltDir = 0),
    onpointercancel: () => (tiltDir = 0),
  });
  const el = h(
    'div.screen.full',
    h('div.view', canvas),
    h('div.hud-tl', h('div.row', h('button.btn.icon.sm', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('div.label', m.title)), tele),
    h('div.throttle', h('div.label', 'Thrust'), thr, thrLbl),
    callout,
    h(
      'div.dock',
      h('div.row.wrap', h('button.btn', { 'aria-label': 'Tilt left', ...hold(-1) }, '◀ Tilt'), h('button.btn', { 'aria-label': 'Level the lander', onclick: () => (l.pitchCmd = 0) }, 'Level'), h('button.btn', { 'aria-label': 'Tilt right', ...hold(1) }, 'Tilt ▶'), h('div.spacer'), P.safeSpots || mars ? h('button.btn.sm', { onclick: () => ((hazardOn = !hazardOn), app.toast(hazardOn ? 'Hazard map ON: green = safe ground.' : 'Hazard map OFF')) }, '◎ Hazard map') : null, assistBtn),
      h('div.small.muted', 'Tap the ground to pick a landing spot. Assist flies there for you using the same physics.'),
    ),
  );
  thr.addEventListener('input', () => {
    if (assistOn) toggleAssist(false);
    l.throttleCmd = thr.value / 100;
  });

  function init() {
    l = handover ? buildLander(m, { lander: P, start: handover }) : buildLander(m);
    l.throttleCmd = 0;
    thr.value = 0;
    ended = false;
    calls = new Set();
    targetX = null;
    assistOn = false;
    assistBtn.textContent = '✦ Assist: OFF';
    if (mars) {
      // the sky crane phase begins with the engines already running
      l.throttleCmd = 0.6;
      thr.value = 60;
    }
  }
  function toggleAssist(on = !assistOn) {
    assistOn = on;
    if (on && targetX == null) targetX = nearestSafe(P.terrain, P.target ? (P.target.x0 + P.target.x1) / 2 : l.x, P.footprint);
    assistBtn.textContent = on ? '✦ Assist: ON' : '✦ Assist: OFF';
    assistBtn.classList.toggle('on', on);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dtR = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!ended && !paused && !document.hidden) {
      acc += dtR;
      while (acc >= DT && l.status === 'flying') {
        if (assistOn) guidance(l, targetX, mars ? { vxMax: 25, kz: 0.12, vzMax: 60, maxTilt: 35, vzMin: P.skycraneSpeed } : { vxMax: 15, kz: 0.1 });
        else if (tiltDir) l.pitchCmd = Math.max(-1, Math.min(1, l.pitchCmd + (tiltDir * (l.def.pitchRate ?? 10) * Math.PI) / 180 * DT));
        l.step(DT);
        acc -= DT;
      }
      if (assistOn) {
        thr.value = Math.round(l.throttleCmd * 100);
      }
      callouts();
      if (l.status !== 'flying') finish();
    }
    draw();
    hud();
  }
  function callouts() {
    if (!P.callouts) return;
    const s = l.hoverSecondsLeft() - (P.bingoReserveSeconds ?? 0);
    for (const c of P.callouts) {
      if (s <= c && !calls.has(c)) {
        calls.add(c);
        callout.textContent = `“${c} seconds”`;
        app.beep(990, 0.15, 0.08);
        app.vibrate([40, 40, 40]);
        setTimeout(() => (callout.textContent = ''), 2500);
      }
    }
  }
  async function finish() {
    if (ended) return;
    ended = true;
    const ok = l.status === 'landed';
    const inZone = P.target ? l.x >= P.target.x0 - 60 && l.x <= P.target.x1 + 60 : true;
    const margin = l.hoverSecondsLeft() - (P.bingoReserveSeconds ?? 0);
    const stars = ok ? 1 + (inZone ? 1 : 0) + (margin > 20 ? 1 : 0) : 0;
    if (ok) {
      app.record(m.id, stars, { margin });
      app.beep(523, 0.15);
      setTimeout(() => app.beep(784, 0.3), 170);
    } else app.beep(120, 0.6, 0.08, 'sawtooth');
    const reason = { boulder: 'You landed on a boulder.', tooFast: `You hit the ground at ${l.touch.vz.toFixed(1)} m/s. The legs can take ${l.def.limits.vz} m/s.`, sideways: `You were still sliding sideways at ${l.touch.vx.toFixed(1)} m/s.`, tipped: `The lander was tilted ${(l.touch.tilt + l.touch.slope).toFixed(0)}° (including slope) and tipped over.` }[l.reason];
    const v = await app.modal(
      h(
        'div',
        h('h2', { class: ok ? 'ok' : 'no' }, ok ? (mars ? 'Touchdown confirmed on Mars' : 'Touchdown!') : 'Crash'),
        ok ? h('div.stars', { style: { fontSize: '2rem' } }, '★'.repeat(stars) + '☆'.repeat(3 - stars)) : h('p', reason),
        h('table.spec', h('tbody', [
          ['Touchdown speed', `${l.touch.vz.toFixed(2)} m/s down, ${l.touch.vx.toFixed(2)} m/s sideways`],
          ['Fuel left', `${kg(l.fuel)} (${Math.max(0, margin).toFixed(0)} s of hover before abort)`],
          ['On target', inZone ? 'yes' : 'no'],
        ].map(([k, val]) => h('tr', h('td', k), h('td', val))))),
        h('h3', { style: { marginTop: '12px' } }, 'What really happened'),
        h('p', m.history),
        h('ul.small', m.facts.map((f) => h('li', f))),
        h('div.small.src', h('div.label', 'Sources'), m.sources.map((s) => h('div', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title)))),
        h('p.small.muted', 'Simplified: ' + m.approximate.join(' ')),
      ),
      [
        { label: 'Fly again', value: 'retry' },
        { label: 'Missions', cls: 'primary', value: 'home' },
      ],
    );
    if (v === 'retry') {
      if (mars) app.go('edl', { id });
      else init();
    } else app.go('home');
  }

  /* ---------- drawing ---------- */
  let cam = { x: 0, z: 0, s: 1 };
  function draw() {
    const r = fitCanvas(canvas);
    const c = r.ctx;
    const W = r.w, H = r.h;
    const ground = terrainHeight(P.terrain, l.x);
    const alt = l.z - ground;
    // camera: keep lander and ground in view
    const span = Math.max(60, alt * 1.6 + 40);
    const sTarget = (H * 0.75) / span;
    cam.s += (sTarget - cam.s) * 0.08;
    cam.x += (l.x - cam.x) * 0.15;
    const groundY = H * 0.82;
    const X = (x) => W / 2 + (x - cam.x) * cam.s;
    const Y = (z) => groundY - (z - ground * 0.5 - (ground * 0.5)) * cam.s;
    // sky
    if (mars) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#3b2a24');
      g.addColorStop(1, '#c49a7a');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    } else {
      c.fillStyle = '#020306';
      c.fillRect(0, 0, W, H);
      stars(c, W, H * 0.8);
    }
    // terrain
    const x0 = cam.x - W / 2 / cam.s, x1 = cam.x + W / 2 / cam.s;
    const stepX = Math.max(0.5, (x1 - x0) / 300);
    c.beginPath();
    c.moveTo(0, H);
    for (let x = x0; x <= x1; x += stepX) c.lineTo(X(x), Y(terrainHeight(P.terrain, x)));
    c.lineTo(W, H);
    c.closePath();
    const tg = c.createLinearGradient(0, groundY - 40, 0, H);
    if (mars) {
      tg.addColorStop(0, '#b0603a');
      tg.addColorStop(1, '#5a2c1a');
    } else {
      tg.addColorStop(0, '#8e8c88');
      tg.addColorStop(1, '#3d3c3a');
    }
    c.fillStyle = tg;
    c.fill();
    // boulders
    for (const b of P.terrain.boulders || []) {
      if (b.x < x0 - 10 || b.x > x1 + 10) continue;
      const gy = terrainHeight(P.terrain, b.x);
      c.fillStyle = mars ? '#4a2416' : '#55534f';
      c.beginPath();
      c.ellipse(X(b.x), Y(gy), b.r * cam.s, b.r * 0.7 * cam.s, 0, Math.PI, 0);
      c.fill();
    }
    // target zone
    if (P.target) {
      c.fillStyle = 'rgba(82,210,115,0.18)';
      c.fillRect(X(P.target.x0), Y(terrainHeight(P.terrain, (P.target.x0 + P.target.x1) / 2)) - 3, (P.target.x1 - P.target.x0) * cam.s, 6);
    }
    // hazard map
    if (hazardOn) {
      for (let x = x0; x < x1; x += Math.max(1, stepX * 2)) {
        c.fillStyle = isSafe(P.terrain, x, P.footprint) ? 'rgba(82,210,115,0.55)' : 'rgba(255,92,92,0.45)';
        c.fillRect(X(x), Y(terrainHeight(P.terrain, x)) + 2, Math.max(1, stepX * 2 * cam.s), 5);
      }
    }
    if (targetX != null) {
      const ty = Y(terrainHeight(P.terrain, targetX));
      c.strokeStyle = '#4cc9f0';
      c.beginPath();
      c.moveTo(X(targetX), ty - 30);
      c.lineTo(X(targetX), ty);
      c.stroke();
      c.fillStyle = '#4cc9f0';
      c.font = '11px Inter, system-ui, sans-serif';
      c.fillText('target', X(targetX) + 4, ty - 22);
    }
    // lander
    const lx = X(l.x), ly = Y(l.z);
    const size = Math.max(10, (P.footprint ?? 3) * 1.6 * cam.s);
    c.save();
    c.translate(lx, ly);
    c.rotate(l.pitch);
    // plume
    const T = l._T || 0;
    if (T > 0 && l.status === 'flying') {
      const len = size * (0.6 + (1.6 * T) / l.engine.thrust) * (0.9 + Math.random() * 0.2);
      const g = c.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, mars ? 'rgba(255,220,180,0.9)' : 'rgba(200,220,255,0.8)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-size * 0.18, 0);
      c.lineTo(size * 0.18, 0);
      c.lineTo(0, len);
      c.fill();
    }
    if (mars) {
      // descent stage with rover hanging below on cables (sky crane)
      c.fillStyle = '#d7dbe0';
      c.fillRect(-size * 0.6, -size * 1.4, size * 1.2, size * 0.4);
      c.strokeStyle = '#ccc';
      c.beginPath();
      c.moveTo(-size * 0.3, -size * 1.0);
      c.lineTo(-size * 0.3, -size * 0.35);
      c.moveTo(size * 0.3, -size * 1.0);
      c.lineTo(size * 0.3, -size * 0.35);
      c.stroke();
      c.fillStyle = '#f0f0f0';
      c.fillRect(-size * 0.45, -size * 0.35, size * 0.9, size * 0.25);
      c.fillStyle = '#333';
      for (const wx of [-0.38, 0, 0.38]) {
        c.beginPath();
        c.arc(wx * size, -size * 0.08, size * 0.09, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      // descent stage + legs
      c.fillStyle = id === 'vikram' ? '#d9b44a' : '#c8a25a';
      c.fillRect(-size * 0.5, -size * 0.9, size, size * 0.55);
      c.fillStyle = '#c9ccd2';
      c.fillRect(-size * 0.35, -size * 1.3, size * 0.7, size * 0.42);
      c.strokeStyle = '#d0d0d0';
      c.lineWidth = Math.max(1, size * 0.05);
      c.beginPath();
      c.moveTo(-size * 0.45, -size * 0.4);
      c.lineTo(-size * 0.8, 0);
      c.moveTo(size * 0.45, -size * 0.4);
      c.lineTo(size * 0.8, 0);
      c.stroke();
    }
    c.restore();
    // altitude ruler
    c.fillStyle = '#c9d4e6';
    c.font = '11px Inter, system-ui, sans-serif';
    c.fillText(`${alt.toFixed(alt < 100 ? 1 : 0)} m`, lx + size + 6, ly - size * 0.5);
  }
  function hud() {
    const vz = l.vz, vx = l.vx;
    const hs = l.hoverSecondsLeft() - (P.bingoReserveSeconds ?? 0);
    const lim = l.def.limits;
    const row = (k, v, cls) => h('div.row2', h('span.k', k), h('span', { class: cls || '' }, v));
    clear(tele);
    put(
      tele,
      h('div.hdr', mars ? 'Sky crane' : 'Descent'),
      row('Altitude', `${l.altitude.toFixed(1)} m`),
      row('Vertical speed', `${vz.toFixed(1)} m/s`, -vz > lim.vz && l.altitude < 30 ? 'no' : ''),
      row('Sideways speed', `${vx.toFixed(1)} m/s`, Math.abs(vx) > lim.vx && l.altitude < 15 ? 'warnc' : ''),
      row('Tilt', `${((l.pitch * 180) / Math.PI).toFixed(0)}°`),
      row('Fuel', kg(l.fuel)),
      row('Hover time left', `${Math.max(0, hs).toFixed(0)} s`, hs < 30 ? 'no' : hs < 60 ? 'warnc' : ''),
      row('Gravity', `${l.g} m/s²`),
      h('div.k.small', `Land: ≤ ${lim.vz} m/s down, ≤ ${lim.vx} m/s sideways, upright`),
    );
    thrLbl.textContent = `${Math.round((l.thrust() / l.engine.thrust) * 100)}%`;
  }

  // tap ground to pick target
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = cam.x + (e.clientX - r.left - r.width / 2) / cam.s;
    targetX = x;
    app.toast(isSafe(P.terrain, x, P.footprint) ? 'Target set: looks safe.' : 'Target set, but that ground is NOT safe (rocks or slope).');
  });

  init();
  return {
    el,
    mounted() {
      raf = requestAnimationFrame(frame);
      app.toast(mars ? 'Backshell away! Fly the descent stage: slow down and lower the rover gently.' : 'Drag the thrust slider to slow your fall, tilt to move sideways. Watch your fuel!', 6000);
    },
    destroy: () => cancelAnimationFrame(raf),
    onPause: () => (paused = true),
    get lander() {
      return l;
    },
    toggleAssist,
    setTarget: (x) => (targetX = x),
  };
}
