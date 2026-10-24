/** Perseverance entry: steer with lift, open the parachute in its window, hand over to the sky crane. */
import { openGuide } from '../missionGuide.js';
import { h, clear, put, fitCanvas } from '../dom.js';
import { buildEntry, entryGuidance, rangeTrigger, predictHandover } from '../../missions/landing.js';
import { heatFlux } from '../../core/edl.js';

export function edlScreen(app, { id }) {
  const m = app.content.missions.find((x) => x.id === id);
  const P = m.physics;
  let e;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let speedUp = 1;
  let guided = false;
  let trail = [];
  let predicted = null;
  let predAt = 0;
  let ended = false;
  let k = 0;
  let guidePause = false;
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Entry profile: altitude versus distance travelled' });
  const tele = h('div.tele');
  const lift = h('input', { type: 'range', min: -100, max: 100, value: 100, 'aria-label': 'Lift direction: down to up', 'data-testid': 'lift' });
  const chuteBtn = h('button.btn.go', { onclick: () => deploy(), 'data-testid': 'chute' }, 'Deploy parachute');
  const lamp = h('span.chip');
  const guideBtn = h('button.btn.sm', { onclick: () => setGuided(!guided), 'data-testid': 'guided' }, 'Guided entry: OFF');
  const spdBtn = h('button.btn.sm', { onclick: () => ((speedUp = speedUp === 1 ? 4 : speedUp === 4 ? 10 : 1), (spdBtn.textContent = `×${speedUp}`)) }, '×1');
  const el = h(
    'div.screen.full',
    h('div.view', canvas),
    h('div.hud-tl', h('div.row', h('button.btn.icon.sm', { 'aria-label': 'Back', onclick: () => app.go('expert') }, '←'), h('div.label.grow', m.title), h('button.btn.icon.sm', { 'aria-label': 'Open the full mission guide', 'data-testid': 'guide', onclick: () => ((guidePause = true), openGuide(app, m.id, { onClose: () => ((guidePause = false), (last = 0)) })) }, '?')), tele),
    h(
      'div.dock',
      h('div.row.wrap', h('span.label', 'Lift down'), lift, h('span.label', 'Lift up')),
      h('div.row.wrap', chuteBtn, lamp, h('div.spacer'), guideBtn, spdBtn),
    ),
  );
  lift.addEventListener('input', () => {
    setGuided(false);
    e.liftUp = lift.value / 100;
  });
  function setGuided(on) {
    guided = on;
    guideBtn.textContent = on ? 'Guided entry: ON' : 'Guided entry: OFF';
    guideBtn.classList.toggle('on', on);
  }
  function init() {
    e = buildEntry(m);
    e.liftUp = 1;
    lift.value = 100;
    trail = [];
    ended = false;
  }
  function deploy() {
    const w = e.chuteWindow();
    const ok = e.deployChute();
    if (ok) {
      app.beep(660, 0.2);
      app.vibrate(60);
      app.toast('Parachute open! Heat shield separates in 20 s.');
    } else if (w.why === 'tooSlow') app.toast('Too slow for this parachute now: it would not open properly in time.');
    else fail();
  }
  async function fail() {
    if (ended) return;
    ended = true;
    app.beep(120, 0.6, 0.08, 'sawtooth');
    const msg = { chuteTorn: 'The parachute was opened too fast or under too much air pressure and was torn apart.', impact: 'The capsule hit the ground before the parachute opened.', noChute: 'The capsule slowed down too low without a parachute.' }[e.reason];
    const v = await app.modal(h('div', h('h2.no', 'Entry failed'), h('p', msg), h('p.muted.small', 'Real limit: the Mars 2020 chute opens only between about Mach 2.2 and Mach 1.1, and below a dynamic pressure of ~850 Pa.')), [
      { label: 'Missions', value: 'home' },
      { label: 'Try again', cls: 'primary', value: 'retry' },
    ]);
    if (v === 'retry') init();
    else app.go('expert');
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dtR = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!ended && !guidePause && !document.hidden) {
      acc += dtR * speedUp;
      while (acc >= 0.05 && (e.phase === 'entry' || e.phase === 'chute')) {
        if (guided && e.phase === 'entry') {
          if (k % 40 === 0) {
            e.liftUp = entryGuidance(e, P.targetDownrange);
            lift.value = Math.round(e.liftUp * 100);
          }
          if (k % 10 === 0 && rangeTrigger(e, P.targetDownrange)) deploy();
        }
        k++;
        e.step(0.05);
        acc -= 0.05;
        if (trail.length === 0 || e.t - trail[trail.length - 1][2] > 1) trail.push([e.downrange, e.alt, e.t]);
      }
      if (e.phase === 'failed') fail();
      if (e.phase === 'handover') {
        ended = true;
        const hs = e.handoverState();
        const miss = hs.downrange - P.targetDownrange;
        app.toast(`Backshell separation at ${(hs.alt / 1000).toFixed(1)} km, ${(miss / 1000).toFixed(2)} km from target.`, 4000);
        setTimeout(() => app.go('lander', { id, handover: { x: P.lander.targetCenter + miss, z: hs.alt, vx: hs.vx, vz: hs.vz } }), 1200);
      }
      if (now - predAt > 700 && e.phase !== 'failed') {
        predAt = now;
        predicted = predictHandover(e, e.liftUp, 1.8);
      }
    }
    draw();
    hud();
  }
  function draw() {
    const r = fitCanvas(canvas);
    const c = r.ctx;
    const W = r.w, H = r.h;
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05060b');
    sky.addColorStop(0.6, '#1c1214');
    sky.addColorStop(1, '#6b3b28');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    const maxX = P.targetDownrange * 1.25, maxZ = 130000;
    const L = 40, B = 150, T = 150;
    const X = (x) => L + (x / maxX) * (W - L - 16);
    const Y = (z) => H - B - (z / maxZ) * (H - B - T);
    c.strokeStyle = '#3a2a2a';
    c.beginPath();
    c.moveTo(L, Y(0));
    c.lineTo(W, Y(0));
    c.stroke();
    c.fillStyle = '#8d9cb5';
    c.font = '10px Inter, system-ui, sans-serif';
    for (let z = 0; z <= 120000; z += 30000) c.fillText(`${z / 1000} km`, 2, Y(z) + 3);
    for (let x = 0; x <= maxX; x += 200000) c.fillText(`${x / 1000} km`, X(x) - 10, Y(0) + 14);
    // target ellipse
    const tx = X(P.targetDownrange);
    const half = (P.ellipseKm * 500) / maxX * (W - L - 16);
    c.fillStyle = 'rgba(82,210,115,0.3)';
    c.fillRect(tx - half, Y(0) - 4, half * 2, 8);
    c.fillStyle = '#52d273';
    c.fillText('Jezero target', tx - 30, Y(0) - 10);
    if (predicted > 0) {
      c.strokeStyle = '#4cc9f0';
      c.beginPath();
      c.moveTo(X(predicted), Y(0) - 14);
      c.lineTo(X(predicted), Y(0) + 4);
      c.stroke();
      c.fillStyle = '#4cc9f0';
      c.fillText('predicted', X(predicted) - 22, Y(0) - 18);
    }
    c.strokeStyle = '#ff9933';
    c.lineWidth = 2;
    c.beginPath();
    trail.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](X(p[0]), Y(p[1])));
    c.stroke();
    const px = X(e.downrange), py = Y(e.alt);
    const heat = heatFlux(e.atm().rho, e.s.v, P.aero.noseRadius);
    if (e.phase === 'entry' && heat > 2e4) {
      const g = c.createRadialGradient(px, py, 2, px, py, 28);
      g.addColorStop(0, `rgba(255,170,80,${Math.min(0.9, heat / 1.5e6)})`);
      g.addColorStop(1, 'rgba(255,90,40,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(px, py, 28, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#e7eef8';
    c.beginPath();
    c.arc(px, py, 5, 0, Math.PI * 2);
    c.fill();
    if (e.phase === 'chute') {
      c.strokeStyle = '#ffffff';
      c.beginPath();
      c.arc(px, py - 16, 10, Math.PI, 0);
      c.stroke();
    }
  }
  function hud() {
    const a = e.atm();
    const w = e.chuteWindow();
    const decel = e.peak.g;
    const row = (k2, v) => h('div.row2', h('span.k', k2), h('span', v));
    clear(tele);
    put(
      tele,
      h('div.hdr', e.phase === 'chute' ? 'Parachute descent' : 'Entry'),
      row('Altitude', `${(e.alt / 1000).toFixed(2)} km`),
      row('Speed', `${(e.s.v * 3.6).toFixed(0)} km/h`),
      row('Mach', e.mach.toFixed(2)),
      row('Flight angle', `${((e.s.gamma * 180) / Math.PI).toFixed(1)}°`),
      row('Air pressure on chute', `${e.q.toFixed(0)} Pa`),
      row('Heating', `${(heatFlux(a.rho, e.s.v, P.aero.noseRadius) / 1e4).toFixed(0)} W/cm²`),
      row('Peak g so far', decel.toFixed(1)),
      row('Distance to target', `${((P.targetDownrange - e.downrange) / 1000).toFixed(1)} km`),
      row('Time since entry', `${e.t.toFixed(0)} s`),
    );
    if (e.phase === 'entry') {
      lamp.textContent = w.ok ? 'Chute window: OPEN' : w.why === 'tooSlow' ? 'Chute window: CLOSED (too slow)' : 'Chute window: not yet';
      lamp.style.color = w.ok ? 'var(--good)' : w.why === 'tooSlow' ? 'var(--bad)' : 'var(--warn)';
      chuteBtn.disabled = false;
    } else {
      lamp.textContent = e.phase === 'chute' ? 'Parachute open' : '';
      chuteBtn.disabled = true;
    }
  }
  init();
  return {
    el,
    mounted() {
      raf = requestAnimationFrame(frame);
      app.toast('Entry interface: 125 km. Use lift to adjust how far you fly, then open the parachute when the window is OPEN.', 7000);
    },
    destroy: () => cancelAnimationFrame(raf),
    get entry() {
      return e;
    },
    setGuided,
    setSpeed: (s) => (speedUp = s),
  };
}
