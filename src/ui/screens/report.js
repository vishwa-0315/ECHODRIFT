/**
 * DECODE & REPORT — Light Ruler, queue-and-wait messages to Earth (with a
 * time-skip), "now vs as seen from Earth", the crew signal puzzle (with
 * sonification), and the Planet Hunter transit puzzle.
 */
import { h, clear, fitCanvas, put } from '../dom.js';
import { t, L } from '../i18n.js';
import { lightTime, lightCurve, roundTripYears } from '../../core/sky.js';
import { portrait } from '../art.js';
import { topbar, phaseSteps } from './common.js';

export function reportScreen(app, { world }) {
  const rep = app.content.report;
  const wr = rep[world];
  const wdef = app.worldDef(world);
  const ws = app.ws(world);
  const root = h('div.screen');
  const ly = wdef.distanceLy;
  let step = ws.reportStep || 0;
  let timers = [];

  const steps = [ruler, messages, nowVsThen, signal, planetHunter];
  function goStep(n) {
    step = n;
    ws.reportStep = n;
    app.persist();
    timers.forEach(clearTimeout);
    timers = [];
    if (n >= steps.length) return finish();
    clear(root);
    put(root, topbar(app, t('rep.title')), phaseSteps('report'), h('div.small.muted', { style: { textAlign: 'center', marginBottom: '6px' } }, t('rep.step', { n: n + 1, m: steps.length })));
    steps[n]();
  }
  const nextBtn = (label = t('ui.next'), extra = {}) => h('button.btn.primary.block', { style: { marginTop: '14px' }, onclick: () => goStep(step + 1), 'data-testid': 'rep-next', ...extra }, label);

  /* 1 — Light Ruler */
  function ruler() {
    const out = h('div.card', { style: { textAlign: 'center' } });
    const slider = h('input.slider', { type: 'range', min: 0, max: rep.ruler.length - 1, step: 1, value: 0, 'aria-label': t('rep.rulerAria') });
    const draw = () => {
      const r = rep.ruler[+slider.value];
      const lt = lightTime(r.seconds);
      put(clear(out), h('div.kicker', L(r, 'label')), h('div.timeskip', { style: { fontSize: '2.4rem' } }, `${lt.value < 10 ? lt.value.toFixed(1) : Math.round(lt.value).toLocaleString()} ${t('unit.' + lt.unit)}`), h('p.small.muted', t('rep.rulerSub')));
    };
    slider.addEventListener('input', () => (draw(), app.sfx('tick')));
    draw();
    put(root, h('h2', t('rep.rulerTitle')), h('p', t('rep.rulerIntro')), out, slider, h('p.small', t('rep.roundTrip', { ly, y: roundTripYears(ly) })), nextBtn());
  }

  /* 2 — Queue questions, time skip, answers */
  function messages() {
    const chosen = new Set();
    const list = h('div.list');
    const send = h('button.btn.primary.block', { style: { marginTop: '12px' }, disabled: true, onclick: () => transmit(), 'data-testid': 'rep-send' }, '📡 ', t('rep.send'));
    const draw = () => {
      clear(list);
      for (const q of wr.questions) {
        const on = chosen.has(q.id);
        list.appendChild(
          h(
            'button.btn.block' + (on ? '.sel' : ''),
            { style: { justifyContent: 'flex-start', textAlign: 'left' }, 'aria-pressed': on ? 'true' : 'false', 'data-q': q.id, onclick: () => (on ? chosen.delete(q.id) : chosen.size < 3 && chosen.add(q.id), app.sfx('click'), draw()) },
            on ? '☑ ' : '☐ ',
            L(q, 'label'),
          ),
        );
      }
      send.disabled = chosen.size === 0;
    };
    draw();
    put(root, h('h2', t('rep.msgTitle')), h('p', t('rep.msgIntro', { y: roundTripYears(ly) })), list, send);

    async function transmit() {
      app.sfx('ping');
      clear(root);
      const counter = h('div.timeskip', '0');
      const meanwhile = h('p.center.muted', t('rep.meanwhile0'));
      put(root, topbar(app, t('rep.title'), { back: null }), h('div.spacer'), h('div.kicker.center', t('rep.waiting')), counter, h('p.center', t('rep.years')), meanwhile, h('div.spacer'));
      const total = roundTripYears(ly);
      const dur = app.settings.reduceMotion ? 300 : 2800;
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          const f = Math.min(1, (performance.now() - t0) / dur);
          counter.textContent = Math.round(total * f * f);
          if (f > 0.35) meanwhile.textContent = t('rep.meanwhile1');
          if (f > 0.75) meanwhile.textContent = t('rep.meanwhile2');
          if (f < 1) requestAnimationFrame(tick);
          else res();
        };
        tick();
      });
      app.sfx('success');
      const answers = wr.questions.filter((q) => chosen.has(q.id));
      for (const q of answers) if (q.unlocks) app.unlockFact(q.unlocks);
      app.evidence(['light-delay'], 'report:' + world);
      app.persist();
      clear(root);
      put(root, 
        topbar(app, t('rep.title'), { back: null }),
        h('div.kicker', t('rep.reply', { y: total })),
        h(
          'div.list',
          answers.map((q) => h('div.card', h('div.row', { style: { alignItems: 'flex-start' } }, h('div.portrait', { style: { width: '48px', height: '48px', color: '#9fb3ff' }, html: portrait('mc1', 'calm', '#9fb3ff') }), h('div', h('div.small.muted', L(q, 'label')), h('p', { style: { margin: '4px 0 0' } }, L(q, 'answer')))))),
          ws.hypothesis === 'unknown' ? h('div.card.glow', h('b', 'MC-1: '), L({ id: world + '-unknownReveal', t: wr.unknownReveal }, 't')) : null,
        ),
        h('p.small.muted', t('rep.late')),
        nextBtn(),
      );
    }
  }

  /* 3 — Now vs as seen from Earth */
  function nowVsThen() {
    const changed = world === 'hollow';
    const box = h('div.card', { style: { textAlign: 'center' } });
    let showNow = false;
    const draw = () => {
      const size = showNow && changed ? 130 : 80;
      const color = showNow && changed ? '#ff6b5b' : '#ffd25e';
      put(clear(box), 
        h('div', { style: { height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, h('div', { style: { width: size + 'px', height: size + 'px', borderRadius: '50%', background: `radial-gradient(circle, #fff, ${color} 55%, ${color}00 72%)`, transition: 'all .6s' }, role: 'img', 'aria-label': showNow ? t('rep.now') : t('rep.seen', { ly }) })),
        h('b', showNow ? t('rep.now') : t('rep.seen', { ly })),
        h('p.small.muted', showNow ? (changed ? t('rep.nowChanged') : t('rep.nowSame', { ly })) : t('rep.seenExplain', { ly })),
      );
    };
    draw();
    put(root, 
      h('h2', t('rep.nvtTitle')),
      box,
      h('div.seg', { role: 'group', style: { marginTop: '10px', alignSelf: 'center' } }, h('button', { 'aria-pressed': 'true', onclick: (e) => sel(e, false) }, t('rep.seenShort')), h('button', { 'aria-pressed': 'false', onclick: (e) => sel(e, true), 'data-testid': 'now' }, t('rep.nowShort'))),
      nextBtn(),
    );
    function sel(e, v) {
      showNow = v;
      e.target.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false'));
      app.sfx('click');
      draw();
    }
  }

  /* 4 — Crew signal puzzle */
  function signal() {
    const sg = wr.signal;
    const revealed = new Set();
    const wrap = h('div');
    const draw = () => {
      clear(wrap);
      put(wrap, 
        h('p', L({ id: world + '-signal-prompt', t: sg.prompt }, 't')),
        h(
          'div.list',
          sg.readings.map((r, i) => {
            const sp = app.content.dialogue.speakers[r.crew];
            const open = revealed.has(i);
            return h(
              'button.card.row',
              { style: { textAlign: 'left', cursor: 'pointer', minHeight: '64px' }, 'data-testid': 'reading-' + i, 'aria-expanded': open ? 'true' : 'false', onclick: () => (revealed.add(i), app.sfx('blip'), draw()) },
              h('div.portrait', { style: { width: '48px', height: '48px', color: sp.color }, html: portrait(r.crew, 'thinking', sp.color) }),
              h('div.grow', h('div.small', { style: { color: sp.color, fontWeight: 700 } }, L({ ...sp, id: 'speaker-' + r.crew }, 'name'), ' · ', L(r, 'label', `${world}-reading-${i}`)), h('div', open ? L(r, 'value', `${world}-readingv-${i}`) : t('rep.tapReading'))),
            );
          }),
        ),
        h('button.btn', { style: { marginTop: '10px' }, onclick: listen }, '🔊 ', t('rep.listen')),
        revealed.size === sg.readings.length
          ? h('div.list', { style: { marginTop: '12px' } }, h('div.kicker', t('rep.whatIsIt')), sg.options.map((o) => h('button.btn.block', { 'data-opt': o.id, onclick: () => choose(o) }, L(o, 'label', `${world}-opt-${o.id}`))))
          : h('p.small.muted', { style: { marginTop: '10px' } }, t('rep.revealAll')),
      );
    };
    function listen() {
      // Sonification: hear the timing pattern.
      const ans = sg.answer;
      let times = [];
      if (ans === 'probe') {
        let tt = 0;
        for (const g of [2, 3, 5]) {
          for (let i = 0; i < g; i++) times.push((tt += 160));
          tt += 500;
        }
      } else if (ans === 'pulsar') times = Array.from({ length: 24 }, (_, i) => i * 70);
      else times = [0, 90, 400, 470, 900, 1250, 1290, 1600, 2100, 2160];
      times.forEach((ms) => timers.push(setTimeout(() => app.sfx('tick'), ms)));
    }
    async function choose(o) {
      const right = o.id === sg.answer;
      app.sfx(right ? 'success' : 'fail');
      await app.modal(h('div', h('div.kicker', right ? t('rep.right') : t('rep.notQuite')), h('p', L(o, 'why', `${world}-why-${o.id}`))));
      if (right) {
        app.unlockFact('f-pulsar');
        goStep(step + 1);
      }
    }
    draw();
    put(root, h('h2', t('rep.signalTitle')), wrap);
  }

  /* 5 — Planet Hunter (transit method) */
  function planetHunter() {
    const ph = rep.planetHunter[world];
    const samples = 600;
    const curve = lightCurve(ph.planets, ph.span, samples, 0.0012, 3 + world.length);
    const dips = [];
    for (const p of ph.planets) for (let tt = p.phase; tt < ph.span; tt += p.period) dips.push({ t: tt + p.duration / 2, planet: p.id, depth: p.depth });
    const marks = [];
    const canvas = h('canvas.chart', { role: 'img', 'aria-label': t('rep.chartAria') });
    const info = h('p.small', t('rep.markDips'));
    const cands = h('div.list');
    const tdips = h('div.row.wrap', { style: { marginTop: '6px' } });
    function draw() {
      const { w, h: hh, ctx } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, hh);
      const min = 1 - Math.max(...ph.planets.map((p) => p.depth)) * 1.6;
      const yOf = (v) => 12 + ((1.003 - v) / (1.003 - min)) * (hh - 30);
      ctx.strokeStyle = 'rgba(255,255,255,.1)';
      for (let d = 0; d <= ph.span; d += 5) {
        const x = (d / ph.span) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, hh);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.font = '10px sans-serif';
        ctx.fillText(d + 'd', x + 2, hh - 4);
      }
      ctx.strokeStyle = '#ffd25e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < samples; i++) {
        const x = (i / samples) * w;
        ctx[i ? 'lineTo' : 'moveTo'](x, yOf(curve[i]));
      }
      ctx.stroke();
      for (const m of marks) {
        const x = (m.t / ph.span) * w;
        ctx.strokeStyle = '#3ff0d2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, hh);
        ctx.stroke();
      }
    }
    function mark(tt) {
      // Snap to the nearest real dip (forgiving on small screens).
      let best = null;
      for (const d of dips) if (!best || Math.abs(d.t - tt) < Math.abs(best.t - tt)) best = d;
      if (!best || Math.abs(best.t - tt) > ph.span * 0.04) {
        app.toast(t('rep.noDip'));
        return;
      }
      if (marks.includes(best)) return;
      marks.push(best);
      if (marks.length > 2) marks.shift();
      app.sfx('tick');
      app.haptic(8);
      evaluate();
      draw();
    }
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      mark(((e.clientX - r.left) / r.width) * ph.span);
    });
    // Accessible alternative: list of dips as buttons.
    dips
      .sort((a, b) => a.t - b.t)
      .forEach((d, i) => tdips.appendChild(h('button.btn', { style: { minHeight: '44px', padding: '4px 10px', fontSize: '.8rem' }, 'data-dip': i, onclick: () => mark(d.t) }, t('rep.dipAt', { d: d.t.toFixed(1) }))));
    function evaluate() {
      clear(cands);
      if (marks.length < 2) {
        info.textContent = t('rep.markOneMore');
        return;
      }
      const [a, b] = [...marks].sort((x, y) => x.t - y.t);
      if (a.planet !== b.planet) {
        info.textContent = t('rep.differentDips');
        return;
      }
      const p = ph.planets.find((x) => x.id === a.planet);
      const n = Math.round((b.t - a.t) / p.period);
      if (n !== 1) {
        info.textContent = t('rep.notNeighbours');
        return;
      }
      const deepest = Math.max(...ph.planets.map((x) => x.depth));
      info.textContent = t('rep.measured', { d: (b.t - a.t).toFixed(1), size: p.depth === deepest ? t('rep.bigger') : t('rep.smaller') });
      put(cands, 
        h('div.kicker', t('rep.whichWorld')),
        ...ph.candidates.map((c) =>
          h(
            'button.btn.block',
            {
              'data-cand': c.id,
              onclick: async () => {
                if (c.id === ph.target && a.planet === ph.target) {
                  app.sfx('success');
                  app.unlockFact('f-transit');
                  await app.modal(h('div', h('h2', t('rep.found')), h('p', t('rep.foundBody'))));
                  goStep(step + 1);
                } else if (c.id === a.planet) {
                  app.toast(t('rep.otherPlanet'), 3000);
                } else {
                  app.sfx('fail');
                  app.toast(t('rep.checkMeasure'), 3000);
                }
              },
            },
            L(c, 'label', `${world}-cand-${c.id}`),
          ),
        ),
      );
    }
    put(root, h('h2', t('rep.phTitle')), h('p', t('rep.phIntro')), canvas, info, h('details', h('summary.small.muted', t('rep.dipList')), tdips), cands);
    requestAnimationFrame(draw);
    const onR = () => draw();
    window.addEventListener('resize', onR);
    cleanup = () => window.removeEventListener('resize', onR);
  }
  let cleanup = () => {};

  async function finish() {
    await app.dialogue(app.content.dialogue.worlds[world].afterReport);
    ws.reportStep = 0;
    app.advance(world, 'report');
    app.go('forge', { world });
  }

  goStep(step);
  return {
    el: root,
    worldId: world,
    destroy: () => {
      timers.forEach(clearTimeout);
      cleanup();
    },
  };
}
