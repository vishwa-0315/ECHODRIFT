/**
 * FORGE — Cosmic Chef. Mass is the main dial (it decides a star's fate);
 * ingredients are the fun layer (iron fizzles the furnace!). Then place a
 * planet in the Goldilocks zone and watch the star age and the zone move.
 */
import { h, clear, fitCanvas, put } from '../dom.js';
import { t, L } from '../i18n.js';
import { cookStar, luminosity, habitableZone, lifetimeYears, starType } from '../../core/stars.js';
import { topbar, phaseSteps } from './common.js';

export function forgeScreen(app, { world }) {
  const fc = app.content.forge;
  const wf = fc.worlds[world];
  const root = h('div.screen');
  const counts = Object.fromEntries(fc.ingredients.map((i) => [i.id, 0]));
  let massV = 300; // slider position 0..1000 (log scale)
  let raf = 0;
  let anim = null; // current canvas animation fn(t)
  let swirl = []; // ingredient sparks
  const canvas = h('canvas', { role: 'img', 'aria-label': t('forge.furnaceAria') });
  const massOf = (v) => fc.massMin * Math.pow(fc.massMax / fc.massMin, v / 1000);
  const typeInfo = (ty) => fc.types[ty] || { name: ty, color: '#fff', joke: '' };
  const tName = (ty) => L({ ...typeInfo(ty), id: 'startype-' + ty }, 'name');

  function render() {
    clear(root);
    const mass = massOf(massV);
    const ty = starType(mass);
    const slider = h('input.slider', { type: 'range', min: 0, max: 1000, value: massV, 'aria-label': t('forge.massAria'), 'data-testid': 'mass' });
    const massLbl = h('div.row', h('b', t('forge.mass')), h('span.grow', ''), h('span.chip', { 'aria-live': 'polite' }, `${mass < 1 ? mass.toFixed(2) : mass.toFixed(1)} ☉ · ${tName(ty)}`));
    slider.addEventListener('input', () => {
      massV = +slider.value;
      const m = massOf(massV);
      massLbl.querySelector('.chip').textContent = `${m < 1 ? m.toFixed(2) : m.toFixed(1)} ☉ · ${tName(starType(m))}`;
    });
    slider.addEventListener('change', () => app.sfx('tick'));
    put(root, 
      topbar(app, t('forge.title'), { onHelp: () => app.coach('forge', { x: 180, y: 300, text: t('forge.coach'), gesture: 'tap' }, true) }),
      phaseSteps('forge'),
      h('div.card', { style: { marginBottom: '10px' } }, h('div.kicker', t('forge.order')), h('div', L({ id: world + '-forge-goal', t: wf.goal }, 't')), h('div.small.muted', t('forge.needs', { types: wf.requirement.types.map(tName).join(' / '), h: wf.requirement.minHydrogen }))),
      h('div.furnace', canvas),
      h('div', { style: { height: '8px' } }),
      massLbl,
      slider,
      h('div.small.muted', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', t('forge.tiny')), h('span', t('forge.huge'))),
      h(
        'div.ingr',
        { style: { marginTop: '8px' } },
        fc.ingredients.map((ing) =>
          h(
            'button.ing',
            { style: { color: ing.color }, 'aria-label': `${L(ing, 'name')}: ${counts[ing.id]}`, 'data-ing': ing.id, onclick: () => add(ing), title: L(ing, 'desc') },
            ing.id,
            h('small', L(ing, 'name')),
            h('span.cnt', '×' + counts[ing.id]),
          ),
        ),
      ),
      h('div.row', { style: { marginTop: '10px' } }, h('button.btn', { onclick: () => (fc.ingredients.forEach((i) => (counts[i.id] = 0)), (swirl = []), render()) }, '🗑 ', t('forge.empty')), h('button.btn.warm.grow', { onclick: cook, 'data-testid': 'cook' }, '👨‍🍳 ', t('forge.cook'))),
    );
    anim = idle;
    loop();
  }

  function add(ing) {
    counts[ing.id]++;
    app.sfx('blip', 1 + Object.values(counts).reduce((a, b) => a + b, 0) * 0.05);
    app.haptic(8);
    for (let i = 0; i < 10; i++) swirl.push({ a: Math.random() * 6.28, r: 1.4 + Math.random() * 0.6, c: ing.color, life: 1 });
    const btn = root.querySelector(`[data-ing="${ing.id}"] .cnt`);
    if (btn) btn.textContent = '×' + counts[ing.id];
    if (ing.id === 'Fe') app.toast(t('forge.ironWarn'), 1800);
  }

  /* ---------- canvas ---------- */
  function loop() {
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const fn = (now) => {
      const { w, h: hh, ctx } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, hh);
      const done = anim(ctx, w, hh, (now - t0) / 1000);
      if (!done) raf = requestAnimationFrame(fn);
    };
    raf = requestAnimationFrame(fn);
  }
  function drawStar(ctx, x, y, r, color, wobble = 0) {
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 2.4);
    g.addColorStop(0, '#fffef6');
    g.addColorStop(0.35, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * (2.4 + wobble), 0, Math.PI * 2);
    ctx.fill();
  }
  function chefHat(ctx, x, y, s) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - s * 0.5, y, s * 0.45, 0, Math.PI * 2);
    ctx.arc(x, y - s * 0.25, s * 0.55, 0, Math.PI * 2);
    ctx.arc(x + s * 0.5, y, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - s * 0.6, y, s * 1.2, s * 0.6);
  }
  function idle(ctx, w, hh, tt) {
    const m = massOf(massV);
    const ty = starType(m);
    const r = Math.min(w, hh) * (0.08 + 0.12 * Math.min(1, Math.log10(m * 20 + 1) / 3));
    drawStar(ctx, w / 2, hh / 2, r, typeInfo(ty).color, app.settings.reduceMotion ? 0 : Math.sin(tt * 3) * 0.08);
    chefHat(ctx, w / 2, hh / 2 - r * 1.25, r * 0.7);
    for (const s of swirl) {
      s.a += 0.04;
      s.r = Math.max(0.2, s.r - 0.004);
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(s.a) * s.r * r * 1.6, hh / 2 + Math.sin(s.a) * s.r * r * 1.6, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (swirl.length > 120) swirl.splice(0, swirl.length - 120);
    return false;
  }

  /* ---------- cooking ---------- */
  async function cook() {
    const mass = massOf(massV);
    const res = cookStar({ mass, ingredients: counts }, wf.requirement);
    if (res.fizzle) {
      app.sfx('fizzle');
      app.haptic([40, 30, 40]);
      app.unlockFact('f-iron');
      counts.Fe = 0;
      await app.modal(h('div', h('h2', '💨 ' + t('forge.fizzle')), h('p', L({ id: 'forge-iron', t: fc.ironFizzle }, 't'))));
      return render();
    }
    if (res.reason === 'noFuel') {
      app.sfx('fail');
      return app.toast(t('forge.noFuel', { n: wf.requirement.minHydrogen }), 3000);
    }
    app.sfx('whoosh');
    if (res.reason === 'tooSmall') {
      await app.modal(h('div', h('h2', tName('browndwarf')), h('p', L({ ...typeInfo('browndwarf'), id: 'startype-browndwarf' }, 'joke'))));
      return;
    }
    await timelapse(res);
    app.unlockFact('f-star-lifetimes');
    if (!res.ok) {
      await app.modal(h('div', h('h2', t('forge.made', { type: tName(res.type) })), h('p', L({ ...typeInfo(res.type), id: 'startype-' + res.type }, 'joke')), h('p.muted', t('forge.wrongType', { need: wf.requirement.types.map(tName).join(' / ') }))), [{ label: t('forge.again'), cls: 'primary', value: 1 }]);
      return render();
    }
    await app.modal(h('div', h('div.kicker', t('forge.success')), h('h2', t('forge.made', { type: tName(res.type) })), h('p', L({ ...typeInfo(res.type), id: 'startype-' + res.type }, 'joke'))), [{ label: t('forge.toGoldilocks'), cls: 'primary', value: 1 }]);
    await goldilocks(res);
    app.evidence(['star-change', 'habitable-zone'], 'forge:' + world);
    app.unlockFact('f-habitable-zone');
    app.unlockFact('f-red-giant');
    await app.modal(h('div', h('h2', '🚀'), h('p', L({ id: world + '-forge-success', t: wf.success }, 't'))));
    const lines = app.content.dialogue.worlds[world].outro;
    await app.dialogue(lines, { glyphSolved: app.ws(world).glyphSolved });
    app.advance(world, 'forge');
    app.go('debrief', { world });
  }

  /** Fast life-and-death time-lapse of the forged star. */
  function timelapse(res) {
    return new Promise((resolve) => {
      const stages = res.stages;
      const per = app.settings.reduceMotion ? 0.9 : 1.8;
      const caption = h('div.card', { 'aria-live': 'polite', style: { marginTop: '8px' } });
      root.querySelector('.furnace').after(caption);
      let lastStage = -1;
      anim = (ctx, w, hh, tt) => {
        const i = Math.min(stages.length - 1, Math.floor(tt / per));
        const f = (tt % per) / per;
        const st = stages[i];
        if (i !== lastStage) {
          lastStage = i;
          caption.innerHTML = '';
          put(caption, h('div.kicker', `${i + 1}/${stages.length}`), h('div', L({ id: 'stage-' + st, t: fc.stages[st] }, 't')), i === 0 ? h('div.small.muted', t('forge.lifetime', { y: fmtYears(res.lifetime) })) : null);
          app.sfx(st === 'supernova' ? 'boom' : 'tick');
          if (st === 'supernova') app.haptic([80, 40, 120]);
        }
        const cx = w / 2;
        const cy = hh / 2;
        const base = Math.min(w, hh) * 0.12;
        switch (st) {
          case 'redgiant':
          case 'supergiant':
            drawStar(ctx, cx, cy, base * (1 + f * 1.4), '#ff5a3c');
            break;
          case 'nebula':
            ctx.strokeStyle = `rgba(120,220,255,${0.8 - f * 0.4})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx, cy, base * (1 + f * 2), 0, Math.PI * 2);
            ctx.stroke();
            drawStar(ctx, cx, cy, base * 0.2, '#ffffff');
            break;
          case 'supernova':
            ctx.fillStyle = `rgba(255,255,255,${1 - f})`;
            ctx.fillRect(0, 0, w, hh);
            drawStar(ctx, cx, cy, base * (1 + f * 4), '#9fd3ff');
            break;
          case 'whitedwarf':
            drawStar(ctx, cx, cy, base * 0.18, '#eef4ff');
            break;
          case 'neutronstar':
            drawStar(ctx, cx, cy, base * 0.12, '#bcd7ff');
            ctx.strokeStyle = 'rgba(160,210,255,.7)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(tt * 8) * w, cy + Math.sin(tt * 8) * w);
            ctx.lineTo(cx - Math.cos(tt * 8) * w, cy - Math.sin(tt * 8) * w);
            ctx.stroke();
            break;
          case 'blackhole':
            ctx.fillStyle = 'rgba(255,150,60,.6)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, base * 1.4, base * 0.4, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(cx, cy, base * 0.5, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'slowfade':
            drawStar(ctx, cx, cy, base * (0.6 - f * 0.3), '#ff6a4d');
            break;
          default:
            drawStar(ctx, cx, cy, base * 0.8, typeInfo(st).color || '#ffd25e', Math.sin(tt * 3) * 0.05);
        }
        if (tt > per * stages.length + 0.4) {
          caption.remove();
          resolve();
          return true;
        }
        return false;
      };
      loop();
    });
  }

  /** Place a planet in the habitable zone, then watch the zone move outward. */
  function goldilocks(res) {
    return new Promise((resolve) => {
      clear(root);
      const lum0 = luminosity(res.mass);
      const zone0 = habitableZone(lum0);
      const minAU = Math.max(0.01, zone0.inner / 6);
      const maxAU = zone0.outer * 4;
      const toX = (au, w) => 20 + ((Math.log(au) - Math.log(minAU)) / (Math.log(maxAU) - Math.log(minAU))) * (w - 40);
      let planetAU = zone0.inner / 2.5;
      let phase = 'place';
      let gyr = 0;
      const rate = fc.brightenPerGyr[res.type] ?? 0.1;
      const lifeGyr = Math.min(lifetimeYears(res.mass) / 1e9, 12);
      const status = h('div.card', { 'aria-live': 'polite' });
      const slider = h('input.slider', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': t('forge.planetAria'), 'data-testid': 'planet' });
      const auFromSlider = () => minAU * Math.pow(maxAU / minAU, +slider.value / 1000);
      slider.value = String((1000 * Math.log(planetAU / minAU)) / Math.log(maxAU / minAU));
      slider.addEventListener('input', () => {
        planetAU = auFromSlider();
        updateStatus();
      });
      const placeBtn = h('button.btn.primary.block', { onclick: place, 'data-testid': 'place' }, t('forge.place'));
      const cv = h('canvas', { style: { width: '100%', height: '220px', borderRadius: '16px', background: '#0b0820', border: '1px solid var(--line)', touchAction: 'none' }, role: 'img', 'aria-label': t('forge.zoneAria') });
      put(root, topbar(app, t('forge.gTitle'), { back: null }), h('p', t('forge.gIntro')), cv, h('div', { style: { height: '8px' } }), slider, status, placeBtn);
      cv.addEventListener('pointerdown', drag);
      cv.addEventListener('pointermove', (e) => e.buttons && drag(e));
      function drag(e) {
        if (phase !== 'place') return;
        const r = cv.getBoundingClientRect();
        const x = e.clientX - r.left;
        const frac = Math.min(1, Math.max(0, (x - 20) / (r.width - 40)));
        planetAU = minAU * Math.pow(maxAU / minAU, frac);
        slider.value = String(frac * 1000);
        updateStatus();
      }
      const zoneNow = () => habitableZone(lum0 * Math.pow(1 + rate, gyr));
      function inZone() {
        const z = zoneNow();
        return planetAU >= z.inner && planetAU <= z.outer;
      }
      function updateStatus() {
        const z = zoneNow();
        const where = planetAU < z.inner ? 'hot' : planetAU > z.outer ? 'cold' : 'ok';
        put(clear(status), 
          h('div', h('b', `${planetAU.toFixed(2)} AU`), ' · ', where === 'ok' ? '💧 ' + t('forge.liquid') : where === 'hot' ? '🔥 ' + t('forge.tooHot') : '🧊 ' + t('forge.tooCold')),
          phase === 'watch' ? h('div.small.muted', t('forge.gyr', { n: gyr.toFixed(1) })) : null,
        );
      }
      async function place() {
        if (!inZone()) {
          app.sfx('fail');
          app.toast(t('forge.notInZone'), 2500);
          return;
        }
        app.sfx('success');
        phase = 'watch';
        slider.disabled = true;
        placeBtn.remove();
        const start = performance.now();
        const dur = app.settings.reduceMotion ? 1000 : 5000;
        let leftBehindAt = null;
        await new Promise((r) => {
          const step = () => {
            const f = Math.min(1, (performance.now() - start) / dur);
            gyr = f * lifeGyr;
            if (!inZone() && leftBehindAt == null) {
              leftBehindAt = gyr;
              app.haptic(30);
            }
            updateStatus();
            if (f < 1) requestAnimationFrame(step);
            else r();
          };
          step();
        });
        const msg = rate === 0 ? t('forge.steady') : leftBehindAt != null ? t('forge.leftBehind', { n: leftBehindAt.toFixed(1) }) : t('forge.stillOk');
        await app.modal(h('div', h('h2', t('forge.gResult')), h('p', msg), h('p.small.muted', t('forge.gLesson'))));
        cancelAnimationFrame(gRaf);
        resolve();
      }
      let gRaf = 0;
      const drawZone = () => {
        const { w, h: hh, ctx } = fitCanvas(cv);
        ctx.clearRect(0, 0, w, hh);
        const z = zoneNow();
        const zx1 = toX(z.inner, w);
        const zx2 = toX(z.outer, w);
        ctx.fillStyle = 'rgba(63,240,210,.18)';
        ctx.fillRect(zx1, 20, zx2 - zx1, hh - 50);
        ctx.strokeStyle = 'rgba(63,240,210,.8)';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(zx1, 20, zx2 - zx1, hh - 50);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(63,240,210,.9)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('forge.zone'), (zx1 + zx2) / 2, 14);
        drawStar(ctx, 18, hh / 2 - 10, 14 * Math.pow(1 + rate, gyr * 0.3), typeInfo(res.type).color);
        const px = toX(planetAU, w);
        ctx.fillStyle = inZone() ? '#4fc3f7' : planetAU < z.inner ? '#ff8a3d' : '#cfe8ff';
        ctx.beginPath();
        ctx.arc(px, hh / 2 - 10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.font = '10px sans-serif';
        ctx.fillText(t('forge.closer'), 50, hh - 8);
        ctx.fillText(t('forge.farther'), w - 50, hh - 8);
        gRaf = requestAnimationFrame(drawZone);
      };
      updateStatus();
      gRaf = requestAnimationFrame(drawZone);
    });
  }

  function fmtYears(y) {
    if (y >= 1e12) return t('forge.trillion', { n: (y / 1e12).toFixed(1) });
    if (y >= 1e9) return t('forge.billion', { n: (y / 1e9).toFixed(1) });
    return t('forge.million', { n: Math.round(y / 1e6) });
  }

  render();
  return { el: root, worldId: world, destroy: () => cancelAnimationFrame(raf) };
}
