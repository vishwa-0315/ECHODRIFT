/**
 * FLY — Gravity Golf + Mission Control.
 * Drag anywhere (or from the ship) to aim, release to burn. Time freezes while
 * aiming. Rendering + input only; all rules live in core/flight.js.
 */
import { h, fitCanvas } from '../dom.js';
import { t, L } from '../i18n.js';
import { FlightSim } from '../../core/flight.js';
import { DT, bodyPos, predictPath, activeGust } from '../../core/physics.js';
import { drawBody, starField, hexA } from '../art.js';
import { starsText, phaseSteps } from './common.js';

const MAX_PARTICLES = 220;

export function flightScreen(app, { world, replay = false }) {
  const wdef = app.worldDef(world);
  const ws = app.ws(world);
  const levels = wdef.levels.map((id) => app.content.flight.find((l) => l.id === id));
  let levelIdx = replay ? 0 : Math.min(ws.levelIndex || 0, levels.length - 1);
  let level = levels[levelIdx];
  let sim;
  let fails = 0;
  let speed = 1;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let aim = null; // {sx,sy,cx,cy}
  let ending = null; // {until, kind}
  let shake = 0;
  let coach = null;
  let banner = null;
  let bannerUntil = 0;
  let paused = false;
  let pointerId = null;
  const field = starField(app.settings.graphics === 'saver' ? 60 : 150, 11);
  const particles = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0 }));
  const tuning = app.tuning;
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim() || '#3ff0d2';

  /* ---------- DOM ---------- */
  const canvas = h('canvas', { style: { position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }, 'aria-label': t('fly.canvasLabel'), role: 'img' });
  const titleEl = h('div', { style: { fontWeight: 700, flex: 1 } });
  const fuelFill = h('div.fill');
  const hullFill = h('div.fill');
  const fuelM = h('div.meter', h('span', { 'aria-hidden': 'true' }, '⛽'), h('span.sr-only', t('fly.fuel')), h('div.track', fuelFill), h('span.fuelv', ''));
  const hullM = h('div.meter', h('span', { 'aria-hidden': 'true' }, '🛡'), h('span.sr-only', t('fly.hull')), h('div.track', hullFill), h('span.hullv', ''));
  const goalsEl = h('div.small.muted');
  const indicator = h('div.indicator', { 'aria-live': 'polite' });
  const burnsEl = h('span.chip');
  const coastBtn = h('button.btn', { onclick: () => (sim.coast(), app.sfx('click')), 'data-testid': 'coast' }, '▶ ', t('fly.coast'));
  const speedBtn = h('button.btn', { onclick: () => toggleSpeed(), 'aria-label': t('fly.speed') }, '1×');
  const previewBtn = h('button.btn', { onclick: () => app.setSetting('fullPreview', !app.settings.fullPreview), 'aria-label': t('fly.fullPreview') }, '👁');
  const hud = h(
    'div.hud',
    h('div.row', titleEl, h('button.btn.icon', { 'aria-label': t('ui.help'), onclick: () => showCoach(true) }, '?'), h('button.btn.icon', { 'aria-label': t('ui.pause'), onclick: () => pauseMenu(), 'data-testid': 'pause' }, '⏸')),
    h('div.row', h('div.grow', fuelM), h('div.grow', hullM)),
    goalsEl,
  );
  const bottom = h('div.hud-bottom', indicator, burnsEl, h('div.spacer'), previewBtn, speedBtn, coastBtn);
  const el = h('div.screen.full', canvas, hud, bottom);

  function toggleSpeed() {
    speed = speed === 1 ? 2 : 1;
    speedBtn.textContent = speed + '×';
    app.sfx('click');
  }

  /* ---------- level lifecycle ---------- */
  async function startLevel(showBrief = true) {
    sim = new FlightSim(level, tuning);
    aim = null;
    ending = null;
    acc = 0;
    particles.forEach((p) => (p.life = 0));
    titleEl.textContent = `${levelIdx + 1}/${levels.length} · ${L(level, 'title')}`;
    const g = level.goals;
    goalsEl.textContent = `★★ ${t('fly.goalFuel', { n: g.fuelLeftPct })} · ★★★ ${t('fly.goalClean', { s: g.time })}`;
    const best = ws.levelStars[level.id];
    const moving = level.ship.orbit || level.ship.vx || level.ship.vy;
    coastBtn.style.display = moving ? '' : 'none';
    const unlocked = app.totalStars() >= app.content.extras.tuning.fullPreviewUnlockStars;
    previewBtn.style.display = unlocked ? '' : 'none';
    if (showBrief) {
      paused = true;
      await app.modal(
        h('div', phaseSteps('fly'), h('div.kicker', t('fly.level', { n: levelIdx + 1, m: levels.length })), h('h2', L(level, 'title')), h('p', L(level, 'brief')), best ? h('p.stars', t('fly.best'), ' ', starsText(best)) : null, h('p.small.muted', t('fly.objective.' + level.objective.type))),
        [{ label: t('fly.go'), cls: 'primary', value: true }],
      );
      paused = false;
    }
    showCoach(false);
  }

  function showCoach(force) {
    coach?.dismiss();
    const r = canvas.getBoundingClientRect();
    const p = toScreen(sim.ship.x, sim.ship.y);
    coach = app.coach('fly', { x: Math.min(r.width - 80, Math.max(80, p.x)), y: Math.min(r.height - 160, p.y - 30), text: t('fly.coachDrag'), gesture: 'drag', dx: 0, dy: 70 }, force);
  }

  /* ---------- camera ---------- */
  let view = { scale: 1, ox: 0, oy: 0, w: 1, h: 1 };
  function layout() {
    const r = canvas.getBoundingClientRect();
    const b = level.bounds;
    const landscape = r.width > r.height;
    const top = landscape ? 96 : 120;
    const bottomPad = landscape ? 64 : 74;
    const availH = Math.max(100, r.height - top - bottomPad);
    const scale = Math.min(r.width / b.w, availH / b.h);
    view = { scale, ox: (r.width - b.w * scale) / 2, oy: top + (availH - b.h * scale) / 2, w: r.width, h: r.height };
  }
  const toScreen = (x, y) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale });

  /* ---------- input ---------- */
  function onDown(e) {
    if (paused || ending || !sim.canBurn()) return;
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    const r = canvas.getBoundingClientRect();
    aim = { sx: e.clientX - r.left, sy: e.clientY - r.top, cx: e.clientX - r.left, cy: e.clientY - r.top };
    coach?.dismiss();
    app.haptic(8);
  }
  function onMove(e) {
    if (!aim || e.pointerId !== pointerId) return;
    const r = canvas.getBoundingClientRect();
    aim.cx = e.clientX - r.left;
    aim.cy = e.clientY - r.top;
  }
  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!aim) return;
    const dv = aimDv();
    aim = null;
    if (dv.frac < 0.04) return; // tiny drag = cancel
    sim.burn(dv.x, dv.y);
    app.sfx('burn', dv.frac);
    app.haptic(Math.round(15 + dv.frac * 30));
    spawnExhaust(dv);
  }
  function aimDv() {
    const dx = aim.sx - aim.cx;
    const dy = aim.sy - aim.cy;
    const len = Math.hypot(dx, dy);
    const maxLen = Math.min(view.w, view.h) * 0.32;
    const frac = Math.min(1, len / maxLen);
    const maxDv = Math.min(level.maxDvPerBurn, sim.fuel / (level.fuelPerDv ?? 1));
    if (len < 1) return { x: 0, y: 0, frac: 0 };
    return { x: (dx / len) * frac * maxDv, y: (dy / len) * frac * maxDv, frac, mag: frac * maxDv };
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId === pointerId) {
      pointerId = null;
      aim = null;
    }
  });

  /* ---------- particles (pooled, no per-frame allocation) ---------- */
  function emit(x, y, vx, vy, life, color, size) {
    for (const p of particles) {
      if (p.life <= 0) {
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.life = p.max = life;
        p.color = color;
        p.size = size;
        return;
      }
    }
  }
  function spawnExhaust(dv) {
    const n = app.settings.graphics === 'saver' ? 8 : 24;
    const m = Math.hypot(dv.x, dv.y) || 1;
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const c = Math.cos(spread);
      const s = Math.sin(spread);
      const ux = -dv.x / m;
      const uy = -dv.y / m;
      emit(sim.ship.x, sim.ship.y, (ux * c - uy * s) * (40 + Math.random() * 60) + sim.ship.vx, (ux * s + uy * c) * (40 + Math.random() * 60) + sim.ship.vy, 0.5 + Math.random() * 0.4, '#ffc04d', 2 + Math.random() * 2);
    }
  }
  function explode(x, y, big = true) {
    const n = app.settings.graphics === 'saver' ? 30 : big ? 120 : 30;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * (big ? 120 : 50);
      emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 1.2, i % 3 ? '#ff8a3d' : '#ffe27a', 1.5 + Math.random() * 3.5);
    }
  }

  /* ---------- events from the sim ---------- */
  function handleEvents() {
    while (sim.events.length) {
      const ev = sim.events.shift();
      if (ev.type === 'debris') {
        shake = 0.4;
        explode(ev.x, ev.y, false);
        app.sfx('boom');
        app.haptic([30, 30, 30]);
        app.toast(L({ id: 'quip-debris', t: app.content.dialogue.quips.debris[0] }, 't'), 1500);
      } else if (ev.type === 'heat') {
        app.haptic(40);
        setBanner('🔥 ' + t('fly.heat'), 1.2);
      } else if (ev.type === 'fail') {
        shake = 0.8;
        explode(sim.ship.x, sim.ship.y, ev.reason !== 'lost' && ev.reason !== 'timeout');
        if (ev.reason !== 'lost' && ev.reason !== 'timeout') {
          app.sfx('boom');
          app.haptic([60, 40, 120]);
        } else app.sfx('fail');
        ending = { kind: 'fail', until: performance.now() + (app.settings.reduceMotion ? 300 : 1500), reason: ev.reason };
      } else if (ev.type === 'success') {
        app.sfx('success');
        app.haptic([20, 40, 20, 40, 60]);
        ending = { kind: 'success', until: performance.now() + 700 };
      }
    }
  }
  function setBanner(text, secs) {
    if (!banner) {
      banner = h('div.banner', { role: 'status' });
      el.appendChild(banner);
    }
    banner.textContent = text;
    banner.style.display = '';
    bannerUntil = performance.now() + secs * 1000;
  }

  async function finish() {
    const kind = ending.kind;
    ending = null;
    paused = true;
    const quips = app.content.dialogue.quips;
    const pick = (arr, key) => L({ id: `quip-${key}-${Math.floor(Math.random() * arr.length)}`, t: arr[Math.floor(Math.random() * arr.length)] }, 't');
    if (kind === 'fail') {
      fails++;
      const reason = sim.failReason;
      const quip = pick(quips[reason] || quips.crash, reason);
      const hint = fails >= tuning.hintAfterFails ? L({ id: `${level.id}-hint${Math.min(fails - tuning.hintAfterFails, level.hints.length - 1)}`, t: level.hints[Math.min(fails - tuning.hintAfterFails, level.hints.length - 1)] }, 't') : null;
      const v = await app.modal(
        h('div', h('h2', t('fly.fail.' + reason)), h('p', quip), hint ? h('div.card', { style: { borderColor: 'var(--amber)' } }, h('b', '💡 '), hint) : null),
        [
          { label: t('ui.map'), value: 'map' },
          { label: t('fly.retry'), cls: 'primary', value: 'retry' },
        ],
      );
      paused = false;
      if (v === 'map') return app.go('map');
      return startLevel(false);
    }
    // success
    const stars = sim.stars;
    const prev = ws.levelStars[level.id] || 0;
    ws.levelStars[level.id] = Math.max(prev, stars);
    if (stars === 3 && (!app.save.ghosts[level.id] || stars >= prev)) app.save.ghosts[level.id] = sim.path.slice(0, 1200);
    app.evidence(level.concepts, 'flight:' + level.id + (stars === 3 ? ':3' : ''));
    const newFact = app.unlockFact(level.fact);
    if (sim.fuelLeftPct > 70) app.badge('fuelSaver');
    if (!replay) ws.levelIndex = Math.max(ws.levelIndex, levelIdx + 1);
    app.persist();
    const fact = app.content.science.facts.find((f) => f.id === level.fact);
    const quip = sim.fuelLeftPct > 70 ? pick(quips.fuelSaver, 'fuelSaver') : stars === 3 ? pick(quips.success3, 'success3') : pick(quips.success1, 'success1');
    const v = await app.modal(
      h(
        'div',
        h('div.kicker', t('fly.success')),
        h('div.stars', { style: { fontSize: '2.4rem', textAlign: 'center' }, 'aria-label': t('fly.starsAria', { n: stars }) }, starsText(stars)),
        h('p.center.small.muted', t('fly.stats', { fuel: Math.round(sim.fuelLeftPct), hull: Math.round(sim.hull), time: sim.time.toFixed(1) })),
        h('p', quip),
        fact ? h('div.card', h('div.kicker', newFact ? t('fact.new') : t('fact.didYouKnow')), h('b', L(fact, 'title')), h('p.small', { style: { margin: '4px 0 0' } }, L(fact, 'text'))) : null,
      ),
      [
        { label: t('fly.retry'), value: 'retry' },
        { label: t('ui.next'), cls: 'primary', value: 'next' },
      ],
    );
    paused = false;
    if (v === 'retry') return startLevel(false);
    if (levelIdx + 1 < levels.length) {
      levelIdx++;
      level = levels[levelIdx];
      layout();
      fails = 0;
      return startLevel(true);
    }
    if (replay) return app.go('map');
    await app.dialogue(app.content.dialogue.worlds[world].afterFly);
    app.advance(world, 'fly');
    app.go('investigate', { world });
  }

  async function pauseMenu() {
    if (paused) return;
    paused = true;
    const v = await app.modal(h('div', h('h2', t('ui.paused')), h('p.muted', L(level, 'brief'))), [
      { label: t('ui.map'), value: 'map' },
      { label: t('fly.restart'), value: 'restart' },
      { label: t('ui.resume'), cls: 'primary', value: 'resume' },
    ]);
    paused = false;
    last = performance.now();
    if (v === 'map') app.go('map');
    else if (v === 'restart') startLevel(false);
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dtReal = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!paused && !aim && !document.hidden) {
      if (sim.status === 'flying') {
        acc += dtReal * (level.timeScale || 1) * speed;
        let n = 0;
        while (acc >= DT && n < 40 && sim.status === 'flying') {
          sim.step();
          acc -= DT;
          n++;
        }
      }
      if (sim.events.length) handleEvents();
      if (ending && now >= ending.until) finish();
    }
    // particles
    const pdt = paused ? 0 : dtReal * (ending?.kind === 'fail' ? 0.35 : 1); // slow-motion explosion
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= pdt;
      p.x += p.vx * pdt;
      p.y += p.vy * pdt;
    }
    if (shake > 0) shake = Math.max(0, shake - dtReal);
    if (banner && now > bannerUntil) banner.style.display = 'none';
    render(now / 1000);
    updateHud();
  }

  function updateHud() {
    const fp = sim.fuelLeftPct;
    fuelFill.style.width = fp + '%';
    fuelM.className = 'meter' + (fp < 15 ? ' bad' : fp < 35 ? ' warn' : '');
    fuelM.querySelector('.fuelv').textContent = Math.round(fp) + '%';
    hullFill.style.width = Math.max(0, sim.hull) + '%';
    hullM.className = 'meter' + (sim.hull < 35 ? ' bad' : sim.hull < 70 ? ' warn' : '');
    hullM.querySelector('.hullv').textContent = Math.round(Math.max(0, sim.hull)) + '%';
    const ind = sim.indicator();
    const st = sim.status === 'aiming' ? 'ready' : ind.status;
    if (indicator.dataset.s !== st) {
      indicator.dataset.s = st;
      indicator.textContent = st === 'ready' ? t('fly.ready') : `${t('orbit.' + st)}${ind.body ? ' · ' + L(ind.body, 'name') : ''}`;
    }
    burnsEl.textContent = `🔥 ${sim.maxBurns - sim.burns}/${sim.maxBurns}`;
    burnsEl.setAttribute('aria-label', t('fly.burnsLeft', { n: sim.maxBurns - sim.burns }));
    coastBtn.disabled = sim.status !== 'aiming';
    previewBtn.setAttribute('aria-pressed', app.settings.fullPreview ? 'true' : 'false');
    previewBtn.style.opacity = app.settings.fullPreview ? 1 : 0.55;
  }

  function render(time) {
    const { w, h: hh, ctx } = fitCanvas(canvas, app.settings.graphics === 'saver' ? 1 : 2);
    if (Math.abs(view.w - w) > 1 || Math.abs(view.h - hh) > 1) layout();
    ctx.save();
    ctx.fillStyle = '#070818';
    ctx.fillRect(0, 0, w, hh);
    if (shake > 0 && !app.settings.reduceMotion) ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    if (app.settings.graphics !== 'saver') field.draw(ctx, w, hh, time, app.settings.reduceMotion ? 0 : sim.ship.x * 0.6, app.settings.reduceMotion ? 0 : sim.ship.y * 0.6);
    else field.draw(ctx, w, hh, 0, 0, 0, false);
    const S = view.scale;
    const wd = sim.world;
    const tt = sim.ship.t;
    const gust = activeGust(wd, tt);
    if (gust) {
      ctx.fillStyle = 'rgba(255,95,162,0.07)';
      ctx.fillRect(0, 0, w, hh);
    }
    // bounds frame
    ctx.strokeStyle = 'rgba(160,170,255,0.08)';
    ctx.strokeRect(view.ox, view.oy, level.bounds.w * S, level.bounds.h * S);

    // orbit guide lines
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    for (const b of wd.bodies) {
      if (!b.orbit) continue;
      const p = toScreen(...Object.values(bodyPos(wd.byId[b.orbit.parent], tt, wd.byId)));
      ctx.strokeStyle = 'rgba(160,170,255,0.18)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.orbit.radius * S, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // goal zone
    const o = level.objective;
    const teal = col('--teal');
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    if (['orbit', 'hohmann', 'aerobrake'].includes(o.type)) {
      const p = toScreen(...Object.values(bodyPos(sim.target, tt, wd.byId)));
      ctx.fillStyle = hexA(teal.startsWith('#') ? teal : '#3ff0d2', 0.08 + 0.05 * pulse);
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.rMax * S, 0, Math.PI * 2);
      ctx.arc(p.x, p.y, o.rMin * S, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.strokeStyle = teal;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.rMin * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.rMax * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (o.type === 'escape') {
      const p = toScreen(...Object.values(bodyPos(sim.target, tt, wd.byId)));
      ctx.strokeStyle = teal;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, o.distance * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (o.type === 'land') {
      const p = toScreen(...Object.values(bodyPos(sim.target, tt, wd.byId)));
      ctx.strokeStyle = teal;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (sim.target.radius + 4) * S, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    } else {
      const z = sim.goalZone();
      const p = toScreen(z.x, z.y);
      ctx.fillStyle = hexA('#3ff0d2', 0.12 + 0.1 * pulse);
      ctx.strokeStyle = teal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, z.r * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = teal;
      ctx.font = `bold ${12}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(o.type === 'lagrange' ? t('fly.calmSpot') : o.type === 'slingshot' ? t('fly.beacon') : '', p.x, p.y - z.r * S - 6);
    }

    // atmospheres
    for (const a of wd.atmospheres) {
      const b = wd.byId[a.body];
      const p = toScreen(...Object.values(bodyPos(b, tt, wd.byId)));
      const g = ctx.createRadialGradient(p.x, p.y, b.radius * S, p.x, p.y, (b.radius + a.height) * S);
      g.addColorStop(0, hexA(b.color, 0.55));
      g.addColorStop(1, hexA(b.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (b.radius + a.height) * S, 0, Math.PI * 2);
      ctx.fill();
    }

    // bodies
    for (const b of wd.bodies) {
      const p = toScreen(...Object.values(bodyPos(b, tt, wd.byId)));
      if (b.type === 'blackhole') drawBody(ctx, p.x, p.y, b.horizon * S, '#000000', 'blackhole');
      else if (b.type === 'probe' || b.type === 'station') {
        ctx.fillStyle = b.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(time);
        ctx.fillRect(-b.drawRadius * S, -2, b.drawRadius * 2 * S, 4);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      } else drawBody(ctx, p.x, p.y, b.radius * S, b.color, b.type, app.settings.graphics !== 'saver');
      if (b.name && b.type !== 'probe') {
        ctx.fillStyle = 'rgba(230,232,255,.75)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(L(b, 'name'), p.x, p.y + ((b.radius || b.horizon || 8) + 14) * S + 4);
      }
    }

    // debris
    for (const d of sim.debris) {
      if (!d.alive) continue;
      const p = toScreen(d.x, d.y);
      ctx.fillStyle = '#8c7f78';
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rr = d.r * S * (0.75 + 0.25 * Math.sin(i * 3 + d.id));
        ctx[i ? 'lineTo' : 'moveTo'](p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
      }
      ctx.fill();
    }

    // ghost replay
    const ghost = app.save.ghosts[level.id];
    if (ghost && ghost.length > 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      for (let i = 0; i < ghost.length; i += 2) {
        const p = toScreen(ghost[i], ghost[i + 1]);
        ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // trail
    const tr = sim.path;
    if (tr.length > 4) {
      ctx.strokeStyle = hexA('#ffc04d', 0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const start = Math.max(0, tr.length - 400);
      for (let i = start - (start % 2); i < tr.length; i += 2) {
        const p = toScreen(tr[i], tr[i + 1]);
        ctx[i === start - (start % 2) ? 'moveTo' : 'lineTo'](p.x, p.y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // trajectory preview (same integrator as the sim)
    const flareOut = sim.previewDisabled();
    if (flareOut && sim.status !== 'success' && sim.status !== 'fail') setBanner('☀ ' + t('fly.flare'), 0.2);
    if ((aim || sim.status === 'flying') && !flareOut && sim.status !== 'fail') {
      const shipState = { ...sim.ship };
      if (aim) {
        const dv = aimDv();
        shipState.vx += dv.x;
        shipState.vy += dv.y;
      }
      const secs = app.settings.fullPreview && previewBtn.style.display !== 'none' ? app.content.extras.tuning.fullPreviewSeconds : tuning.previewSeconds;
      const pts = predictPath(wd, shipState, secs * (aim ? 1 : 0.6), 6);
      ctx.strokeStyle = aim ? teal : hexA('#3ff0d2', 0.35);
      ctx.lineWidth = aim ? 2.5 : 1.5;
      ctx.setLineDash(aim ? [] : [4, 6]);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const p = toScreen(pts[i], pts[i + 1]);
        ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }

    // aim arrow
    const sp = toScreen(sim.ship.x, sim.ship.y);
    if (aim) {
      const dv = aimDv();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(aim.sx, aim.sy);
      ctx.lineTo(aim.cx, aim.cy);
      ctx.stroke();
      ctx.setLineDash([]);
      const len = 30 + dv.frac * 60;
      const m = Math.hypot(dv.x, dv.y) || 1;
      const ex = sp.x + (dv.x / m) * len;
      const ey = sp.y + (dv.y / m) * len;
      ctx.strokeStyle = col('--amber');
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = col('--amber');
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${t('fly.power')} ${Math.round(dv.frac * 100)}% · ⛽ −${Math.round((dv.mag || 0) * (level.fuelPerDv ?? 1) * 100 / sim.fuelMax)}%`, sp.x, sp.y + 46);
    }

    // particles
    for (const p of particles) {
      if (p.life <= 0) continue;
      const q = toScreen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(q.x - p.size / 2, q.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // ship
    if (!(sim.status === 'fail' && sim.failReason !== 'lost' && sim.failReason !== 'timeout')) {
      const ang = Math.atan2(sim.ship.vy, sim.ship.vx) || -Math.PI / 2;
      const a = aim ? Math.atan2(aimDv().y, aimDv().x) : ang;
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(a + Math.PI / 2);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#f4f6ff';
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 9);
      ctx.lineTo(0, 5);
      ctx.lineTo(-7, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // hold-progress ring
      if (sim.holdTime > 0 && level.objective.hold) {
        ctx.strokeStyle = teal;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 18, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * sim.holdTime) / level.objective.hold);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    // CME warning arrow
    const soon = wd.gusts.find((g) => tt > g.start - 2 && tt < g.start);
    if (gust || soon) {
      const g = gust || soon;
      setBanner(`💨 ${gust ? t('fly.cme') : t('fly.cmeSoon')} ${arrowFor(g.angleDeg)}`, 0.2);
    }
    ctx.restore();
  }

  function arrowFor(deg) {
    const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    return arrows[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  }

  return {
    el,
    worldId: world,
    mounted() {
      sim = new FlightSim(level, tuning);
      layout();
      raf = requestAnimationFrame(frame);
      startLevel(true);
    },
    destroy() {
      cancelAnimationFrame(raf);
      coach?.dismiss?.();
    },
    onPause() {
      if (!paused && !ending) pauseMenu();
    },
    // test hooks
    get sim() {
      return sim;
    },
  };
}
