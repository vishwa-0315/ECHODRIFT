/**
 * Orbital mission screen (Chandrayaan-3, Apollo 13, Voyager 2, Mangalyaan, Aditya-L1).
 * Real-scale map, time warp, finite-burn planner, telemetry, Mission Assist.
 */
import { h, clear, put, fitCanvas } from '../dom.js';
import { dist, speed, dv as fdv, kg, dur, utc } from '../fmt.js';
import { drawBody, starField } from '../render.js';
import { buildMission, toRotating } from '../../missions/orbital.js';
import { runStageChecks } from '../../missions/autoplay.js';
import { MU, RADIUS, DAY, G0, AU } from '../../core/constants.js';
import { openGuide } from '../missionGuide.js';
import { burnTime, propellantFor } from '../../core/ship.js';
import { nextPeriapsis, nextApoapsis } from '../../core/targeting.js';

const WARPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7];
const VIEW = {
  chandrayaan3: { frame: 'inertial', foci: ['earth', 'moon', 'ship'], focus: 'earth', radius: { earth: 450e6, moon: 25e6, ship: 60e6 }, warp: 1e4, target: 'moon', ref: 'earth' },
  apollo13: { frame: 'inertial', foci: ['earth', 'moon', 'ship'], focus: 'earth', radius: { earth: 450e6, moon: 30e6, ship: 60e6 }, warp: 1e4, target: 'moon', ref: 'earth' },
  voyager2: { frame: 'inertial', foci: ['sun', 'jupiter', 'saturn', 'ship'], focus: 'sun', radius: { sun: 11 * AU, jupiter: 4e9, saturn: 3e9, ship: 1 * AU }, warp: 1e6, target: 'saturn', ref: 'sun' },
  mangalyaan: { frame: 'inertial', foci: ['sun', 'earth', 'mars', 'ship'], focus: 'sun', radius: { sun: 1.8 * AU, earth: 3e9, mars: 120e6, ship: 0.2 * AU }, warp: 1e5, target: 'mars', ref: 'sun' },
  aditya: { frame: 'rotating', foci: ['l1', 'earth'], focus: 'l1', radius: { l1: 1.3e9, earth: 2.2e9 }, warp: 1e5, target: null, ref: 'earth' },
};

export function orbitalScreen(app, { id, choice = {} }) {
  const m = app.content.missions.find((x) => x.id === id);
  const V = VIEW[id];
  const design = app.content.design;
  let mission;
  let sim;
  const done = new Set();
  const ctx = { prediction: null };
  let predKey = '';
  let lastPredT = -1e18;
  let lastPredReal = 0;
  let warpIdx = WARPS.indexOf(V.warp);
  let paused = true;
  let lastKeep = 0; // last time the player acted (burn finished or a reminder pause)
  let raf = 0;
  let last = 0;
  let focus = V.focus;
  let viewRadius = V.radius[focus];
  let pan = { x: 0, y: 0 };
  let trail = [];
  let selected = null; // node being edited
  let ended = false;
  let successShown = false;
  let burning = null;
  let savedWarp = null;
  const stars = starField(700, 7);
  const st = m.stageText || {};

  /* ---------- DOM ---------- */
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Trajectory map. Pinch or use the zoom buttons; drag to pan.' });
  const tele = h('div.telegrid');
  const obj = h('div.objline');
  const clock = h('span.clock');
  const warpLbl = h('span.warp.mono');
  const playBtn = h('button.btn.sm', { 'aria-label': 'Play or pause', 'data-testid': 'play', onclick: () => setPaused(!paused) });
  const editor = h('div');
  const focusSeg = h('div.seg', { role: 'group', 'aria-label': 'Centre the view on' });
  const banner = h('div.burned', { style: { display: 'none' } });
  const dock = h(
    'div.dock',
    editor,
    h(
      'div.row.wrap',
      playBtn,
      h('button.btn.icon.sm', { 'aria-label': 'Slower', onclick: () => setWarp(warpIdx - 1) }, '«'),
      warpLbl,
      h('button.btn.icon.sm', { 'aria-label': 'Faster', onclick: () => setWarp(warpIdx + 1) }, '»'),
      clock,
      h('div.spacer'),
      h('button.btn.sm', { onclick: () => addNode(), 'data-testid': 'add-burn' }, '+ Burn'),
      h('button.btn.sm.primary', { onclick: () => assist(), 'data-testid': 'assist' }, 'Mission Assist'),
    ),
  );
  const zoom = h('div.col', h('button.btn.icon.sm', { 'aria-label': 'Zoom in', onclick: () => zoomBy(0.6) }, '+'), h('button.btn.icon.sm', { 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 0.6) }, '−'));
  const el = h(
    'div.screen.full',
    h('div.view', canvas),
    h('div.hud-top', h('div.row', h('button.btn.icon.sm', { 'aria-label': 'Back to missions', onclick: () => leave() }, '←'), h('div.label.grow', m.title), focusSeg), tele, obj),
    h('div.hud-side', zoom, h('button.btn.icon.sm', { 'aria-label': 'Restart mission', onclick: () => restart() }, '↺'), h('button.btn.icon.sm', { 'aria-label': 'Open the full mission guide', 'data-testid': 'guide', onclick: () => (setPaused(true), openGuide(app, m.id)) }, '?')),
    dock,
  );
  dock.insertBefore(banner, dock.firstChild); // burn banner sits just above the controls, clear of the map and objective
  let hintOpen = true;

  /* ---------- setup ---------- */
  function init() {
    lastKeep = 0;
    mission = buildMission(m, design, choice);
    sim = mission.sim;
    done.clear();
    trail = [];
    ended = false;
    successShown = false;
    selected = null;
    burning = null;
    approachWarned = new Set();
    refreshPrediction(true);
    renderFoci();
    renderEditor();
    setWarp(WARPS.indexOf(V.warp));
    setPaused(true);
  }
  function restart() {
    init();
    app.toast('Mission restarted from the beginning.');
  }
  async function leave() {
    const v = await app.modal(h('div', h('h2', 'Leave the mission?'), h('p.muted', 'Your flight will not be saved.')), [
      { label: 'Stay', value: false },
      { label: 'Leave', cls: 'danger', value: true },
    ]);
    if (v) app.go('expert');
  }
  function renderFoci() {
    clear(focusSeg);
    for (const f of V.foci)
      focusSeg.appendChild(
        h('button', { 'aria-pressed': focus === f ? 'true' : 'false', onclick: () => ((focus = f), (viewRadius = V.radius[f]), (pan = { x: 0, y: 0 }), renderFoci()) }, f === 'l1' ? 'L1' : f === 'ship' ? 'Ship' : f[0].toUpperCase() + f.slice(1)),
      );
  }
  function setWarp(i) {
    warpIdx = Math.max(0, Math.min(WARPS.length - 1, i));
    warpLbl.textContent = '×' + WARPS[warpIdx].toLocaleString('en-US');
  }
  function setPaused(p) {
    const changed = paused !== p;
    paused = p;
    if (changed && sim) renderEditor();
    playBtn.textContent = paused ? 'Play' : 'Pause';
    playBtn.className = 'btn sm' + (paused ? ' go' : '');
  }
  function zoomBy(f) {
    viewRadius = Math.max(2e6, Math.min(60 * AU, viewRadius * f));
  }

  /* ---------- prediction ---------- */
  function refreshPrediction(force = false) {
    const key = sim.nodes.map((n) => `${n.t.toFixed(0)}:${n.dv.toFixed(3)}:${n.angle.toFixed(2)}:${n.ref}`).join('|');
    const H = mission.predictHorizon(sim);
    const now = performance.now();
    if (!force && key === predKey && sim.t - lastPredT < H / 40 && now - lastPredReal < 3000) return;
    if (!force && now - lastPredReal < 250) return;
    predKey = key;
    lastPredT = sim.t;
    lastPredReal = now;
    ctx.prediction = sim.predict(H, Math.max(60, H / 900));
  }

  /* ---------- burn planner ---------- */
  function addNode() {
    const t = sim.t + Math.max(600, Math.min(3600, mission.predictHorizon(sim) / 50));
    const n = sim.addNode({ t, dv: 1, angle: 0, ref: refBody(), ...(V.frame === 'rotating' ? rotatingDir(0, t) : {}) });
    selected = n.id;
    setPaused(true);
    renderEditor();
  }
  function refBody() {
    if (focus === 'moon' || focus === 'mars' || focus === 'jupiter' || focus === 'saturn') return focus;
    return V.ref;
  }
  // rotating-frame direction (Aditya): 0 = away from Sun (+x), 90 = ahead (+y)
  function rotatingDir(rotDeg, t) {
    const e = sim.bodyState('earth', t, {});
    const th = Math.atan2(e.y, e.x);
    return { inertial: true, angle: rotDeg + (th * 180) / Math.PI, rotDeg };
  }
  function renderEditor() {
    clear(editor);
    const n = paused ? sim.nodes.find((x) => x.id === selected) : null;
    if (!n) {
      if (sim.nodes.length)
        put(editor, h('div.row.wrap', h('span.small.muted', `${sim.nodes.length} burn${sim.nodes.length > 1 ? 's' : ''} planned:`), sim.nodes.map((x, i) => h('button.btn.sm', { onclick: () => (setPaused(true), (selected = x.id), renderEditor()) }, `#${i + 1} ${fdv(x.dv)} · ${utc(sim.date(x.t)).slice(5, 16)}`))));
      return;
    }
    const mass0 = sim.mass;
    const maxDv = Math.max(1, Math.min(sim.dvLeft(), 2500));
    const tb = burnTime(Math.min(n.dv, sim.dvLeft()), sim.engine.isp, sim.engine.thrust * (n.throttle ?? 1), mass0);
    const prop = propellantFor(Math.min(n.dv, sim.dvLeft()), sim.engine.isp, mass0);
    const H = mission.predictHorizon(sim);
    const tSlider = h('input', { type: 'range', min: 0, max: 1000, value: Math.round(1000 * Math.sqrt(Math.max(0, n.t - sim.t) / H)), 'aria-label': 'When to burn' });
    tSlider.oninput = () => {
      n.t = sim.t + H * (tSlider.value / 1000) ** 2;
      if (V.frame === 'rotating') Object.assign(n, rotatingDir(n.rotDeg ?? 0, n.t));
      sim.nodes.sort((a, b) => a.t - b.t);
      update();
    };
    const dvSlider = h('input', { type: 'range', min: 0, max: 1000, value: Math.round(1000 * Math.sqrt(n.dv / maxDv)), 'aria-label': 'Burn size (delta-v)' });
    dvSlider.oninput = () => {
      n.dv = maxDv * (dvSlider.value / 1000) ** 2;
      update();
    };
    const angSlider = h('input', { type: 'range', min: -180, max: 180, step: 0.5, value: V.frame === 'rotating' ? n.rotDeg ?? 0 : n.angle, 'aria-label': 'Fine direction' });
    angSlider.oninput = () => {
      if (V.frame === 'rotating') Object.assign(n, rotatingDir(+angSlider.value, n.t));
      else n.angle = +angSlider.value;
      update();
    };
    const info = h('div.small.mono');
    function update() {
      const tb2 = burnTime(Math.min(n.dv, sim.dvLeft()), sim.engine.isp, sim.engine.thrust * (n.throttle ?? 1), mass0);
      const pr2 = propellantFor(Math.min(n.dv, sim.dvLeft()), sim.engine.isp, mass0);
      info.textContent = `Δv ${fdv(n.dv)} · burn ${dur(tb2)} · fuel ${kg(pr2)} · at ${utc(sim.date(n.t))} (in ${dur(n.t - sim.t)})`;
      refreshPrediction(true);
    }
    const dirs = V.frame === 'rotating' ? [['Away from Sun', 0], ['Ahead', 90], ['Sunward', 180], ['Behind', -90]] : [['Prograde', 0], ['Retrograde', 180], ['Radial out', 90], ['Radial in', -90]];
    const curDir = V.frame === 'rotating' ? n.rotDeg ?? 0 : n.angle;
    const when = [['+10 min', () => (n.t = sim.t + 600)]];
    if (V.frame !== 'rotating') {
      when.push(['Next periapsis', () => {
        const p = nextPeriapsis(sim, n.ref, Math.min(H, 40 * DAY));
        if (p) n.t = p.t;
        else app.toast('No periapsis found in the prediction window.');
      }]);
      when.push(['Next apoapsis', () => {
        const p = nextApoapsis(sim, n.ref, Math.min(H, 40 * DAY));
        if (p) n.t = p.t;
        else app.toast('No apoapsis found in the prediction window.');
      }]);
    }
    put(
      editor,
      h(
        'div.editor',
        h('div.row', h('b', `Burn #${sim.nodes.indexOf(n) + 1}`), h('span.small.muted', V.frame === 'rotating' ? 'direction in the Sun–Earth frame' : `direction relative to ${n.ref}`), h('div.spacer'), h('button.btn.sm.danger', { onclick: () => (sim.removeNode(n.id), (selected = null), refreshPrediction(true), renderEditor()) }, 'Delete'), h('button.btn.sm', { onclick: () => ((selected = null), renderEditor()) }, 'Done')),
        h('div.line', h('span.label', 'When'), ...when.map(([l, f]) => h('button.btn.sm', { onclick: () => (f(), sim.nodes.sort((a, b) => a.t - b.t), renderEditor(), refreshPrediction(true)) }, l)), tSlider),
        h('div.line', h('span.label', 'Direction'), h('div.seg', dirs.map(([l, a]) => h('button', { 'aria-pressed': Math.abs(curDir - a) < 0.01 ? 'true' : 'false', onclick: () => (V.frame === 'rotating' ? Object.assign(n, rotatingDir(a, n.t)) : (n.angle = a), renderEditor(), refreshPrediction(true)) }, l))), angSlider),
        h(
          'div.line',
          h('span.label', 'Size'),
          ...[-10, -1, -0.1, 0.1, 1, 10].map((d) => h('button.btn.sm', { onclick: () => ((n.dv = Math.max(0, Math.min(maxDv, n.dv + d))), renderEditor(), refreshPrediction(true)) }, (d > 0 ? '+' : '') + d)),
          dvSlider,
        ),
        info,
      ),
    );
    info.textContent = `Δv ${fdv(n.dv)} · burn ${dur(tb)} · fuel ${kg(prop)} · at ${utc(sim.date(n.t))} (in ${dur(n.t - sim.t)})`;
  }

  async function assist() {
    const stage = currentStage();
    if (!stage?.assist) return app.toast('Nothing to burn now: just let time run (press Play).');
    setPaused(true);
    if (stage.ready && !stage.ready(sim, ctx)) return app.toast('Too early: coast closer to your target first, then ask again.');
    refreshPrediction(true);
    if (stage.onTrack && !sim.nodes.length && stage.onTrack(sim, ctx)) return app.toast('You are on track. No burn needed right now: let time run (press Play).');
    const plan = await app.busy('Mission Assist is computing…', () => stage.assist(sim));
    if (!plan || !plan.length) {
      refreshPrediction(true);
      return app.toast(plan && !plan.length ? 'You are on track. No burn needed right now.' : 'Mission Assist could not find a burn from here. Try restarting or coasting a little.');
    }
    for (const n of plan) {
      const added = sim.addNode(n);
      if (V.frame === 'rotating') added.rotDeg = n.angle - (Math.atan2(sim.bodyState('earth', n.t, {}).y, sim.bodyState('earth', n.t, {}).x) * 180) / Math.PI;
      selected = added.id;
    }
    refreshPrediction(true);
    renderEditor();
    const n0 = plan[0];
    app.toast(`Suggested: ${fdv(n0.dv)} burn at ${utc(sim.date(n0.t))}. Check the dashed path, then press Play.`, 5000);
  }

  function currentStage() {
    return mission.stages.find((s) => !done.has(s.id) && !s.bonus) || mission.stages.find((s) => !done.has(s.id));
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dtR = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (!paused && !ended && sim.status === 'flying') step(dtR);
    if (sim.status === 'flying') refreshPrediction();
    draw();
    hud();
  }
  let approachWarned = new Set();
  function step(dtR) {
    let simDt = WARPS[warpIdx] * dtR;
    // stages that need a burn soon (e.g. orbit raising): don't let high warp skip the chances
    const stg = currentStage();
    if (stg?.idlePause && !sim.nodes.length && !burning && !(stg.onTrack && stg.onTrack(sim, ctx))) {
      const due = lastKeep + stg.idlePause;
      if (sim.t + simDt >= due) {
        if (due > sim.t) sim.advance(due - sim.t);
        lastKeep = sim.t;
        setPaused(true);
        app.beep(880, 0.12);
        app.toast('Time for your next burn: plan one (+ Burn) or press Mission Assist, then Play.', 6000);
        return;
      }
    }
    // L1 is unstable: stop time for a station-keeping burn about every four weeks
    if (mission.box && !sim.nodes.length && !burning) {
      const due = lastKeep + 28 * DAY;
      if (sim.t + simDt >= due) {
        if (due > sim.t) sim.advance(due - sim.t);
        lastKeep = sim.t;
        setPaused(true);
        app.beep(880, 0.12);
        app.toast('Station-keeping due: L1 is unstable. Plan a small correction now (or press Mission Assist), then press Play.', 6000);
        return;
      }
    }
    // Approaching the target: never jump past the closest approach; pause shortly before it
    const pr = ctx.prediction;
    const c = V.target && pr?.closest[V.target];
    if (c && c.t > sim.t && !burning) {
      const lead = sim.central === 'sun' ? 2 * DAY : 3 * 3600;
      const key = V.target + Math.round(c.t / 3600);
      const near = c.d < RADIUS[V.target] + (sim.central === 'sun' ? 5e8 : 6e7);
      if (near && !sim.nodes.length && !approachWarned.has(key) && c.t - sim.t <= lead + simDt) {
        approachWarned.add(key);
        simDt = Math.max(0, c.t - lead - sim.t);
        if (simDt > 0) sim.advance(simDt);
        setPaused(true);
        app.beep(880, 0.12);
        app.toast(`Approaching ${V.target[0].toUpperCase() + V.target.slice(1)}: closest approach in ${dur(c.t - sim.t)}. Plan your burn now (or press Mission Assist).`, 6000);
        return;
      }
      if (c.t - sim.t < simDt * 3) simDt = Math.max(60, (c.t - sim.t) / 3);
    }
    const next = sim.nodes[0];
    if (next && !burning) {
      const startT = next.t - burnTime(Math.min(next.dv, sim.dvLeft()), sim.engine.isp, sim.engine.thrust, sim.mass) / 2;
      if (sim.t + simDt >= startT) {
        // arrive exactly at the burn, then slow time so it can be watched
        simDt = Math.max(0, startT - sim.t);
        const durB = burnTime(Math.min(next.dv, sim.dvLeft()), sim.engine.isp, sim.engine.thrust, sim.mass);
        burning = { end: startT + durB, dv: next.dv };
        savedWarp = warpIdx;
        let wi = 0;
        while (wi < WARPS.length - 1 && WARPS[wi + 1] <= durB / 6) wi++;
        setWarp(wi);
        banner.style.display = '';
        banner.textContent = `Engine burning · ${fdv(next.dv)} · ${dur(durB)}`;
        app.beep(220, 0.4, 0.05, 'sawtooth');
        app.vibrate(30);
      }
    }
    if (simDt > 0) sim.advance(simDt);
    if (burning && sim.t >= burning.end - 1e-6 && !sim.nodes.find((n) => n.started && !n.done)) {
      burning = null;
      lastKeep = sim.t;
      banner.style.display = 'none';
      if (savedWarp != null) setWarp(savedWarp);
      savedWarp = null;
      selected = null;
      renderEditor();
      refreshPrediction(true);
    }
    // trail
    const lp = trail[trail.length - 1];
    if (!lp || Math.hypot(sim.y[0] - lp[0], sim.y[1] - lp[1]) > viewRadius / 300) {
      trail.push([sim.y[0], sim.y[1], sim.t]);
      if (trail.length > 5000) trail = trail.filter((_, i) => i % 2 === 0);
    }
    // outcomes
    const f = runStageChecks(mission, sim, ctx, done);
    if (f) return finish(false, 'box');
    if (sim.status === 'crashed') return finish(false, 'crash');
    if (sim.status === 'entered') return finish(mission.finalVerdict(sim) === 'ok', 'entry');
    if (sim.t > sim.def.span - 3600) return finish(done.has(mission.successStage), 'time');
    if (done.has(mission.successStage) && !successShown && mission.endOn !== 'entry') {
      successShown = true;
      const bonusLeft = mission.stages.some((s) => s.bonus && !done.has(s.id));
      if (bonusLeft) {
        setPaused(true);
        app
          .modal(h('div', h('h2.ok', 'Objective complete!'), h('p', 'You can finish now, or keep flying for the bonus objective.')), [
            { label: 'Finish', value: 'finish' },
            { label: 'Keep flying', cls: 'primary', value: 'go' },
          ])
          .then((v) => (v === 'finish' ? finish(true, 'done') : null));
      } else finish(true, 'done');
    }
  }

  async function finish(ok, why) {
    if (ended) return;
    ended = true;
    setPaused(true);
    const stars = ok ? mission.stars(sim, done) : 0;
    if (ok) {
      app.record(m.id, stars);
      app.beep(523, 0.15);
      setTimeout(() => app.beep(784, 0.25), 160);
    } else app.beep(160, 0.5, 0.06, 'sawtooth');
    const reasons = {
      crash: `The spacecraft hit ${sim.crashedInto}. Check the dashed prediction before you speed up time.`,
      box: 'Aditya-L1 drifted out of the zone around L1. L1 is unstable, so small corrections every few weeks are essential.',
      entry: sim.entry ? `Entry angle ${sim.entry.gamma.toFixed(2)}°: ${sim.entry.gamma < m.physics.corridor?.[0] ? 'too steep, so the capsule would burn up.' : 'too shallow, so the capsule would skip off into space.'}` : '',
      time: 'The mission ran out of time.',
    };
    const v = await app.modal(
      h(
        'div',
        h('h2', { class: ok ? 'ok' : 'no' }, ok ? 'Mission accomplished' : 'Mission failed'),
        ok ? h('div.stars', { style: { fontSize: '2rem' } }, '★'.repeat(stars) + '☆'.repeat(3 - stars)) : h('p', reasons[why] || ''),
        h('table.spec', h('tbody', [
          ['Δv used', fdv(sim.deliveredDv)],
          ['Fuel left', kg(sim.fuel)],
          ['Mission date', utc(sim.date())],
          sim.entry ? ['Entry angle', sim.entry.gamma.toFixed(2) + '°'] : null,
        ].filter(Boolean).map(([k, val]) => h('tr', h('td', k), h('td', val))))),
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
    if (v === 'retry') init();
    else app.go('expert');
  }

  /* ---------- drawing ---------- */
  let W = 1, Hh = 1, scale = 1, cx = 0, cy = 0;
  const tmp = { x: 0, y: 0, vx: 0, vy: 0 };
  function pos(body, t) {
    if (body === sim.central) return { x: 0, y: 0 };
    if (body === 'sun' && sim.central === 'earth') {
      const s = sim.bodyState('earth', t, {});
      return { x: -s.x, y: -s.y };
    }
    const s = sim.bodyState(body, t, tmp);
    return { x: s.x, y: s.y };
  }
  function toView(x, y, t) {
    if (V.frame === 'rotating') {
      const r = toRotating(sim, x, y, t);
      return { x: r.x, y: r.y };
    }
    return { x, y };
  }
  function focusPos() {
    if (focus === 'ship') return toView(sim.y[0], sim.y[1], sim.t);
    if (focus === 'l1') return { x: -design.aditya.L1km * 1e3, y: 0 };
    if (V.frame === 'rotating') {
      if (focus === 'earth') return { x: 0, y: 0 };
    }
    const p = pos(focus, sim.t);
    return toView(p.x, p.y, sim.t);
  }
  const S = (p) => ({ x: cx + (p.x - fp.x) / scale + pan.x, y: cy - (p.y - fp.y) / scale + pan.y });
  let fp = { x: 0, y: 0 };

  function draw() {
    const r = fitCanvas(canvas);
    const c = r.ctx;
    W = r.w;
    Hh = r.h;
    // centre the map in the free space between the top HUD and the bottom dock
    const top = el.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 0;
    const bot = dock.getBoundingClientRect().top || Hh;
    const free = Math.max(120, bot - top);
    cx = W / 2;
    cy = top + free / 2;
    scale = viewRadius / (Math.min(W, free) * 0.47);
    fp = focusPos();
    c.fillStyle = '#04060b';
    c.fillRect(0, 0, W, Hh);
    stars(c, W, Hh);
    const t = sim.t;
    // orbits of bodies
    c.lineWidth = 1;
    for (const b of mission.bodies.concat(sim.central === 'sun' ? [] : [])) {
      if (b === sim.central || (V.frame === 'rotating' && b === 'earth')) continue;
      drawOrbitTrace(c, b, t);
    }
    // Aditya: reference orbit + box
    if (V.frame === 'rotating') {
      const box = mission.box;
      const a = S({ x: box.xMinKm * 1e3, y: box.yMaxKm * 1e3 }), b2 = S({ x: box.xMaxKm * 1e3, y: -box.yMaxKm * 1e3 });
      c.strokeStyle = 'rgba(255,153,51,0.5)';
      c.setLineDash([6, 6]);
      c.strokeRect(a.x, a.y, b2.x - a.x, b2.y - a.y);
      c.setLineDash([2, 4]);
      c.strokeStyle = 'rgba(223,232,255,0.45)';
      c.beginPath();
      design.aditya.reference.forEach((p, i) => {
        const q = S({ x: p[0], y: p[1] });
        c[i ? 'lineTo' : 'moveTo'](q.x, q.y);
      });
      c.stroke();
      c.setLineDash([]);
      const l1 = S({ x: -design.aditya.L1km * 1e3, y: 0 });
      c.strokeStyle = '#ff9933';
      c.beginPath();
      c.moveTo(l1.x - 6, l1.y);
      c.lineTo(l1.x + 6, l1.y);
      c.moveTo(l1.x, l1.y - 6);
      c.lineTo(l1.x, l1.y + 6);
      c.stroke();
      label(c, l1.x + 8, l1.y - 8, 'L1', '#ff9933');
      label(c, 12, Hh * 0.45, '← to the Sun (150 million km)', '#8d9cb5');
    }
    // bodies
    const sunDir = (p) => {
      const sp = V.frame === 'rotating' ? { x: -1e15, y: 0 } : pos('sun', t);
      return Math.atan2(-(sp.y - p.y), sp.x - p.x);
    };
    const bodies = [sim.central, ...mission.bodies.filter((b) => b !== sim.central)];
    if (sim.central === 'earth' && !bodies.includes('moon')) bodies.push('moon');
    for (const b of bodies) {
      if (V.frame === 'rotating' && b !== 'earth' && b !== 'moon') continue;
      const p0 = b === sim.central ? { x: 0, y: 0 } : pos(b, t);
      const p = V.frame === 'rotating' ? (b === 'earth' ? { x: 0, y: 0 } : toView(p0.x, p0.y, t)) : p0;
      const q = S(p);
      if (q.x < -200 || q.y < -200 || q.x > W + 200 || q.y > Hh + 200) continue;
      const scaled = drawBody(c, b, q.x, q.y, RADIUS[b] / scale, sunDir(p), { minR: b === 'sun' ? 5 : 3, dpr: r.dpr });
      label(c, q.x + Math.max(6, RADIUS[b] / scale) + 4, q.y - 4, b[0].toUpperCase() + b.slice(1) + (scaled ? '' : ''), '#c9d4e6');
    }
    // flown trail
    c.strokeStyle = 'rgba(255,153,51,0.9)';
    c.lineWidth = 1.6;
    c.beginPath();
    trail.forEach((p, i) => {
      const q = S(toView(p[0], p[1], p[2]));
      c[i ? 'lineTo' : 'moveTo'](q.x, q.y);
    });
    const sp = S(toView(sim.y[0], sim.y[1], t));
    c.lineTo(sp.x, sp.y);
    c.stroke();
    // prediction
    const pr = ctx.prediction;
    if (pr) {
      c.strokeStyle = 'rgba(76,201,240,0.85)';
      c.setLineDash([6, 5]);
      c.lineWidth = 1.4;
      c.beginPath();
      for (let i = 0; i < pr.path.length; i += 3) {
        const q = S(toView(pr.path[i], pr.path[i + 1], pr.path[i + 2]));
        c[i ? 'lineTo' : 'moveTo'](q.x, q.y);
      }
      c.stroke();
      c.setLineDash([]);
      for (const b of pr.burnsOut) {
        const q = S(toView(b.x, b.y, b.end));
        c.fillStyle = '#ff9933';
        c.beginPath();
        c.arc(q.x, q.y, 5, 0, Math.PI * 2);
        c.fill();
      }
      const tgt = V.target && pr.closest[V.target];
      if (tgt) {
        const q = S(toView(tgt.x, tgt.y, tgt.t));
        c.strokeStyle = '#52d273';
        c.beginPath();
        c.arc(q.x, q.y, 6, 0, Math.PI * 2);
        c.stroke();
        label(c, q.x + 9, q.y + 14, `closest ${dist(tgt.d - RADIUS[V.target])} alt`, '#52d273');
      }
      if (pr.entry) {
        const q = S(toView(pr.entry.x, pr.entry.y, pr.entry.t));
        c.fillStyle = '#ffcc4d';
        c.beginPath();
        c.arc(q.x, q.y, 5, 0, Math.PI * 2);
        c.fill();
        label(c, q.x + 8, q.y + 14, `entry ${pr.entry.gamma.toFixed(2)}°`, '#ffcc4d');
      }
      if (pr.crashed && pr.crashed.body !== 'entry') label(c, sp.x + 10, sp.y + 30, `prediction hits ${pr.crashed.body}`, '#ff5c5c');
    }
    // ship
    c.fillStyle = '#ffffff';
    c.shadowColor = '#ffffff';
    c.shadowBlur = 8;
    c.beginPath();
    c.arc(sp.x, sp.y, 3.5, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    // scale bar
    const nice = niceLen(scale * 120);
    c.strokeStyle = '#8d9cb5';
    c.beginPath();
    c.moveTo(14, Hh - 150);
    c.lineTo(14 + nice / scale, Hh - 150);
    c.stroke();
    label(c, 14, Hh - 156, dist(nice), '#8d9cb5');
  }
  const orbitCache = {};
  function drawOrbitTrace(c, b, t) {
    // sample the body's real path over one orbit (cached, refreshed occasionally)
    const key = b;
    const period = { moon: 27.32 * DAY, earth: 365.25 * DAY, mars: 687 * DAY, jupiter: 4332.6 * DAY, saturn: 10759 * DAY, venus: 224.7 * DAY }[b];
    if (!period) return;
    const cache = orbitCache[key];
    if (!cache || Math.abs(cache.t - t) > period / 20) {
      const pts = [];
      for (let i = 0; i <= 180; i++) {
        const tt = Math.min(sim.def.span, Math.max(0, t - period / 2 + (period * i) / 180));
        const p = pos(b, tt);
        pts.push(V.frame === 'rotating' ? toView(p.x, p.y, tt) : p);
      }
      orbitCache[key] = { t, pts };
    }
    c.strokeStyle = 'rgba(141,156,181,0.25)';
    c.beginPath();
    orbitCache[key].pts.forEach((p, i) => {
      const q = S(p);
      c[i ? 'lineTo' : 'moveTo'](q.x, q.y);
    });
    c.stroke();
  }
  function label(c, x, y, txt, col) {
    c.font = '11px Inter, system-ui, sans-serif';
    c.fillStyle = col;
    c.fillText(txt, x, y);
  }
  function niceLen(m) {
    const e = 10 ** Math.floor(Math.log10(m));
    const f = m / e;
    return (f < 2 ? 1 : f < 5 ? 2 : 5) * e;
  }

  /* ---------- HUD ---------- */
  function hud() {
    clock.textContent = utc(sim.date());
    const refB = focus === 'ship' || focus === 'l1' || focus === 'sun' ? (V.frame === 'rotating' ? 'earth' : refBody()) : focus;
    const el = sim.elementsAbout(refB);
    const name = refB[0].toUpperCase() + refB.slice(1);
    const rows = [
      ['Δv left', fdv(sim.dvLeft())],
      ['Fuel', kg(sim.fuel)],
      [`Speed (${name})`, speed(el.v)],
      [refB === 'sun' ? 'From Sun' : `Altitude (${name})`, refB === 'sun' ? dist(el.r) : dist(el.r - RADIUS[refB])],
    ];
    if (el.energy < 0 && refB !== 'sun') {
      rows.push(['Periapsis', dist(el.peri - RADIUS[refB])]);
      rows.push(['Apoapsis', dist(el.apo - RADIUS[refB])]);
    } else if (refB !== 'sun') rows.push(['Orbit', 'not captured']);
    const pr = ctx.prediction;
    if (V.target && pr?.closest[V.target]) rows.push([`Closest ${V.target}`, `${dist(pr.closest[V.target].d - RADIUS[V.target])} alt`]);
    if (m.id === 'apollo13') rows.push(['Predicted entry', pr?.entry ? pr.entry.gamma.toFixed(2) + '°' : 'misses Earth']);
    if (m.id === 'aditya') {
      const rr = toRotating(sim, sim.y[0], sim.y[1], sim.t);
      rows.push(['From L1', dist(Math.hypot(rr.x + design.aditya.L1km * 1e3, rr.y))]);
      rows.push(['Held', `${(sim.t / DAY).toFixed(0)} / ${m.physics.holdDays} d`]);
    }
    clear(tele);
    put(tele, rows.map(([k, v]) => h('div.cell', h('span.k', k), h('span.v', v))));
    if (m.id === 'apollo13') {
      const [lo, hi] = m.physics.corridor;
      const g = pr?.entry?.gamma;
      const pct = (x) => Math.max(0, Math.min(100, ((x + 12) / 12) * 100));
      put(tele, h('div.k', { style: { marginTop: '6px' } }, 'Entry corridor (−12° … 0°)'), h('div.gauge', h('i', { style: { left: pct(lo) + '%', width: pct(hi) - pct(lo) + '%' } }), g != null ? h('b', { style: { left: pct(g) + '%' } }) : null));
    }
    const cur = currentStage();
    const key = [...done].join() + '|' + (cur?.id || '') + hintOpen;
    if (obj._key !== key) {
      obj._key = key;
      clear(obj);
      put(
        obj,
        h(
          'div.row',
          h('span.steps', mission.stages.map((s) => h('span', { class: done.has(s.id) ? 'done' : s === cur ? 'cur' : 'todo', title: (st[s.id] || {}).title }, done.has(s.id) ? '●' : s === cur ? '◉' : '○'))),
          h('b.grow', cur ? (st[cur.id] || { title: cur.id }).title : 'All objectives complete'),
          h('button.btn.sm.ghost', { 'aria-label': 'Show or hide the hint', onclick: () => ((hintOpen = !hintOpen), (obj._key = '')) }, hintOpen ? '▴' : 'ⓘ'),
        ),
        hintOpen && cur && st[cur.id] ? h('div.hint', st[cur.id].hint) : null,
      );
    }
  }

  /* ---------- input: pan & pinch ---------- */
  const pts = new Map();
  let pinch0 = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), r: viewRadius };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      pan.x += e.clientX - p.x;
      pan.y += e.clientY - p.y;
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      viewRadius = Math.max(2e6, Math.min(60 * AU, (pinch0.r * pinch0.d) / Math.max(10, d)));
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => (e.preventDefault(), zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15)), { passive: false });
  canvas.addEventListener('dblclick', () => (pan = { x: 0, y: 0 }));

  init();
  return {
    el,
    mounted() {
      raf = requestAnimationFrame(frame);
      const first = st[mission.stages[0].id];
      if (first) app.toast(`${first.title}: ${first.hint}`, 7000);
    },
    destroy: () => cancelAnimationFrame(raf),
    onPause: () => setPaused(true),
    get sim() {
      return sim;
    },
    get mission() {
      return mission;
    },
    get done() {
      return done;
    },
    setWarpIndex: setWarp,
    setPaused,
    get paused() {
      return paused;
    },
    get warpIndex() {
      return warpIdx;
    },
  };
}
export { G0, MU };
