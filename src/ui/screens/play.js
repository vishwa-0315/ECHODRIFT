/** Quick-play level screen: one big button, a fuel bar, Vyom's tips, stars, quiz card. */
import { h, clear, put, fitCanvas } from '../dom.js';
import { levelById, LEVELS } from '../../arcade/levels.js';
import { createRenderer } from '../../arcade/draw.js';
import { progress } from '../../game/progress.js';
import { guide, vyomSVG, speak } from '../guide.js';
import { sfx, boostOn, boostOff, setMood, unlockAudio } from '../audio.js';
import quiz from '../../../content/quiz.json';
import { BODY } from '../levelIcons.js';
import { drawBody, starField } from '../render.js';
import { flightRecorder, flightGraph, starTargets, coachTip, briefFor } from '../debrief.js';

const CHEERS = ['Brilliant flying!', 'Wow, just like the real mission!', 'You are a natural!', 'Mission control is cheering!'];
const OOPS = ['Oops! Space is tricky.', 'Close one! Let’s try again.', 'Even real missions need practice.'];

export function playScreen(app, { id, demo = false }) {
  const L = levelById(id);
  const prog = progress(app);
  const skin = prog.skin();
  const ri = LEVELS.indexOf(L);
  let game = L.create();
  const rec = flightRecorder();
  const renderer = createRenderer();
  let running = false, raf = 0, last = 0, ended = false;
  let hold = false, tapQueued = false, aim = L.aimMin ?? 0, holdB = false, tapB = false, point = null;
  let demoMode = demo;

  const canvas = h('canvas.play-canvas', { 'aria-label': `${L.title}: game view` });
  const g = guide();
  const info = h('div.play-info');
  const fuelFill = h('div.fuel-fill');
  const fuel = h('div.fuel', h('span.fuel-label', 'Fuel'), h('div.fuel-bar', fuelFill));
  const light = h('div.chute-light', { style: { display: 'none' } });
  const alertEl = h('div.play-alert');
  /* ---------- Vyom's live coaching: compares what you do with what a good pilot would do ---------- */
  const coachEl = h('div.coach-tip', { role: 'status', 'aria-live': 'polite' });
  const coach = { on: app.settings.coach !== false && !L.tapCanvas, wrongA: 0, wrongB: 0, wrongAim: 0, last: -99, t: 0, hideAt: 0 };
  const labelA = () => game.button || (L.buttons ? L.buttons[0] : L.button);
  const labelB = () => (L.buttons ? L.buttons[1] : '');
  function coachSay(text) {
    coachEl.innerHTML = '';
    const face = h('span.toast-vyom', { innerHTML: vyomSVG('wow', 34) });
    put(coachEl, face, h('span', text));
    coachEl.classList.add('show');
    coach.last = coach.t;
    coach.hideAt = coach.t + 2.6;
    speak(text);
  }
  function coachTick(dt, input) {
    coach.t += dt;
    if (coach.hideAt && coach.t > coach.hideAt) ((coach.hideAt = 0), coachEl.classList.remove('show'));
    // only help players who are learning this level (first tries, or after a miss)
    // Vyom only steps in after two failed tries, and never once you have won the level
    const learning = (prog.data.tries[id] || 0) >= 2 && !prog.stars(id);
    if (!coach.on || !learning || coach.t < 2.5) return;
    const b = game.bot() || {};
    const wantA = !!(b.hold || b.tap), wantB = !!(b.holdB || b.tapB);
    const holdy = L.control === 'hold' || L.buttons;
    coach.wrongA = wantA && !input.hold ? coach.wrongA + dt : !wantA && input.hold && holdy ? coach.wrongA - dt : 0;
    coach.wrongB = wantB && !input.holdB ? coach.wrongB + dt : !wantB && input.holdB ? coach.wrongB - dt : 0;
    coach.wrongAim = L.control === 'aim+tap' && b.aim != null && Math.abs(b.aim - input.aim) > 0.18 ? coach.wrongAim + dt * Math.sign(b.aim - input.aim) : 0;
    if (coach.t - coach.last < 5) return;
    if (coach.wrongA > 1.2) coachSay(L.control === 'tap' || L.control === 'aim+tap' ? `Now! Tap ${labelA()}!` : `Now! Hold ${labelA()}!`);
    else if (coach.wrongA < -1.5) coachSay(`Let go of ${labelA()} now.`);
    else if (coach.wrongB > 1.2) coachSay(L.buttons ? `Try ${labelB()} now!` : '');
    else if (coach.wrongB < -1.5) coachSay(`Let go of ${labelB()} now.`);
    else if (coach.wrongAim > 2) coachSay(`Slide ${L.aimLabel || 'AIM'} further right.`);
    else if (coach.wrongAim < -2) coachSay(`Slide ${L.aimLabel || 'AIM'} back a little to the left.`);
  }
  const demoBanner = h('div.demo-banner', { style: { display: demoMode ? '' : 'none' } }, 'Vyom is flying. Watch the button!');
  const mainBtn = h('button.big-btn', { 'data-testid': 'main-btn' }, h('span.big-label', L.buttons ? L.buttons[0] : L.button));
  // levels with two controls (e.g. TILT and STAGE, or LEFT and RIGHT)
  const btnB = L.buttons ? h('button.big-btn.btn-b', { 'data-testid': 'btn-b' }, h('span.big-label', L.buttons[1])) : null;
  const btnRow = btnB ? h('div.dual-btns', mainBtn, btnB) : mainBtn;
  if (L.tapCanvas) mainBtn.style.display = 'none'; // you tap the picture itself
  const aimInput = h('input', { type: 'range', min: L.aimMin ?? -1, max: 1, step: 0.005, value: L.aimMin ?? 0, 'aria-label': L.aimLabel || 'Aim', 'data-testid': 'aim' });
  const nudge = (d) => () => ((aimInput.value = Math.max(-1, Math.min(1, +aimInput.value + d))), (aim = +aimInput.value), sfx.tap());
  const aimRow = h('div.aim-row', { style: { display: L.control === 'aim+tap' ? '' : 'none' } }, L.aimLabel ? h('span.aim-label', L.aimLabel) : null, h('button.btn.icon.sm', { onclick: nudge(-0.01), 'aria-label': 'Aim left a little' }, '−'), aimInput, h('button.btn.icon.sm', { onclick: nudge(0.01), 'aria-label': 'Aim right a little' }, '+'));
  aimInput.addEventListener('input', () => (aim = +aimInput.value));

  const CAMS = [['auto', 'Auto'], ['wide', 'Wide'], ['follow', 'Follow']];
  let camMode = app.settings.cam || 'auto';
  const camBtn = h('button.btn.sm.cam-btn', { 'aria-label': 'Change camera', 'data-testid': 'cam', style: { display: game.kind === 'orbit' ? '' : 'none' } });
  const paintCam = () => (camBtn.textContent = CAMS.find((c) => c[0] === camMode)[1]);
  paintCam();
  camBtn.addEventListener('click', () => {
    camMode = CAMS[(CAMS.findIndex((c) => c[0] === camMode) + 1) % CAMS.length][0];
    app.setSetting('cam', camMode);
    paintCam();
    sfx.tap();
  });
  const el = h(
    'div.screen.full.play',
    canvas,
    h('div.play-top', h('button.btn.icon.sm.ghost', { 'aria-label': 'Back to levels', onclick: () => leave() }, '←'), h('div.play-title', h('div.lvl', `Level ${ri + 1} · ${L.mission}`), h('div.t' + (L.title.length > 17 ? '.long' : ''), L.title)), camBtn),
    h('div.play-hud', info, fuel, light, demoBanner),
    alertEl,
    coachEl,
    h('div.play-bottom', g.el, aimRow, btnRow),
  );

  /* ---------- input ---------- */
  const down = (e) => {
    e.preventDefault();
    unlockAudio();
    if (!running && !demoMode && !ended) {
      g.hide(); // pressing the button skips the intro
      start();
      return;
    }
    if (demoMode || ended) return;
    hold = true;
    tapQueued = true;
    mainBtn.classList.add('pressed');
    app.vibrate(12);
  };
  const up = () => {
    hold = false;
    mainBtn.classList.remove('pressed');
  };
  if (btnB) {
    const downB = (e) => {
      e.preventDefault();
      unlockAudio();
      if (!running && !demoMode && !ended) {
        g.hide();
        start();
        return;
      }
      if (demoMode || ended) return;
      holdB = true;
      tapB = true;
      btnB.classList.add('pressed');
      app.vibrate(12);
    };
    const upB = () => ((holdB = false), btnB.classList.remove('pressed'));
    btnB.addEventListener('pointerdown', downB);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btnB.addEventListener(ev, upB);
  }
  // levels where you tap the picture itself (e.g. NavIC: tap where the circles meet)
  canvas.addEventListener('pointerdown', (e) => {
    if (!L.tapCanvas || ended) return;
    unlockAudio();
    if (!running && !demoMode) {
      g.hide();
      start();
      return;
    }
    if (demoMode) return;
    const r = canvas.getBoundingClientRect();
    point = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  mainBtn.addEventListener('pointerdown', down);
  mainBtn.addEventListener('pointerup', up);
  mainBtn.addEventListener('pointercancel', up);
  mainBtn.addEventListener('pointerleave', up);
  const key = (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.type === 'keydown' && !e.repeat) down(e);
    if (e.type === 'keyup') up();
  };
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);

  /* ---------- loop ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (running && !ended && !document.hidden) {
      let input = { hold, tap: tapQueued, aim, holdB, tapB, point };
      if (demoMode) {
        const b = game.bot();
        input = { hold: !!b.hold, tap: !!b.tap, aim: b.aim ?? 0, holdB: !!b.holdB, tapB: !!b.tapB, point: b.point || null };
        mainBtn.classList.toggle('pressed', !!b.hold || !!b.tap);
        btnB?.classList.toggle('pressed', !!b.holdB || !!b.tapB);
        if (b.aim != null) aimInput.value = b.aim;
      }
      tapQueued = false;
      tapB = false;
      point = null;
      const wasPhase = game.phase;
      if (!demoMode) coachTick(dt, input);
      game.update(dt, input);
      rec.add(game.telemetry?.());
      if (game.phase === 'chute' && wasPhase === 'entry') sfx.chute();
      if (game.burning) boostOn();
      else boostOff();
      if (game.status !== 'play') end();
    }
    const r = fitCanvas(canvas);
    const top = el.querySelector('.play-hud')?.getBoundingClientRect().bottom ?? 120;
    const bottom = el.querySelector('.play-bottom')?.getBoundingClientRect().top ?? r.h - 120;
    renderer.draw(r.ctx, r.w, r.h, game, skin, { top, bottom, dpr: r.dpr, camMode, aids: !prog.stars(id) || demoMode });
    hud();
  }

  function hud() {
    const hd = game.hud();
    clear(info);
    put(info, (hd.info || []).map(([k, v]) => h('div.chip-stat', h('span.k', k), h('span.v', v))));
    fuel.style.display = hd.fuel == null ? 'none' : '';
    if (hd.fuel != null) {
      fuelFill.style.width = `${Math.max(0, Math.min(1, hd.fuel)) * 100}%`;
      fuelFill.classList.toggle('low', hd.fuel < 0.2);
    }
    if (hd.light) {
      light.style.display = '';
      light.className = 'chute-light ' + hd.light;
      light.textContent = { wait: '● Parachute: WAIT', go: '● Parachute: GO NOW!', late: '● Too late', open: '● Parachute open' }[hd.light];
    } else light.style.display = 'none';
    alertEl.textContent = hd.alert || '';
    alertEl.style.display = hd.alert ? '' : 'none';
    // the Perseverance level switches from PARACHUTE (tap) to ENGINE (hold)
    const label = game.button || (L.buttons ? L.buttons[0] : L.button);
    const lab = mainBtn.querySelector('.big-label');
    if (lab.textContent !== label) lab.textContent = label;
    mainBtn.disabled = game.phase === 'chute';
  }

  /* ---------- start / end ---------- */
  let counting = false;
  function start(now = false) {
    if (running || counting) return;
    setMood('play');
    if (now || demoMode || document.body.classList.contains('reduce-motion')) {
      running = true;
      last = 0;
      return;
    }
    // a quick 3-2-1 countdown before every flight
    counting = true;
    const cd = h('div.countdown', { 'aria-live': 'assertive' });
    el.appendChild(cd);
    const steps = ['3', '2', '1', 'GO!'];
    steps.forEach((t, i) =>
      setTimeout(() => {
        cd.textContent = t;
        cd.classList.remove('pop');
        void cd.offsetWidth;
        cd.classList.add('pop');
        i < 3 ? sfx.star(0) : sfx.star(2);
        if (i === 3) {
          running = true;
          counting = false;
          last = 0;
          setTimeout(() => cd.remove(), 450);
        }
      }, i * 420),
    );
  }
  function intro() {
    if (demoMode) {
      g.say(['Watch me fly it! Look at when I press the button.'], 'happy');
      setTimeout(() => {
        g.hide();
        start();
      }, 1400);
      return;
    }
    const tries = prog.data.tries[id] || 0;
    const lines = tries ? [L.goal] : [L.goal, ...L.guide];
    g.say(lines, 'normal', start);
    put(g.el.querySelector('.bubble'), h('div.bubble-go', 'Tap to start ▸'));
  }

  async function end() {
    if (ended) return;
    ended = true;
    coachEl.classList.remove('show');
    rec.last(game.telemetry?.());
    hold = false;
    holdB = false;
    boostOff();
    mainBtn.classList.remove('pressed');
    if (game.status === 'won') {
      sfx.win();
      if (demoMode) return showDemoEnd();
      const touchdown = game.l?.touch?.vz ?? game.land?.l?.touch?.vz;
      const rec = prog.finish(id, game.stars, { touchdown });
      showWin(rec);
    } else {
      sfx.lose();
      if (/crash|hit|fast/i.test(game.reason)) sfx.crash();
      app.vibrate([40, 40, 80]);
      if (demoMode) return showDemoEnd();
      const badges = prog.tried(id);
      showLose(badges);
    }
  }

  function overlay(content) {
    const ov = h('div.overlay.result', { role: 'dialog', 'aria-modal': 'true' }, h('div.modal.result-card', content));
    el.appendChild(ov);
    return ov;
  }

  function starRow(n) {
    const row = h('div.star-row');
    for (let i = 0; i < 3; i++) {
      const s = h('span.star' + (i < n ? '.on' : ''), '★');
      row.appendChild(s);
      if (i < n)
        setTimeout(() => {
          s.classList.add('pop');
          sfx.star(i);
        }, 350 + i * 380);
    }
    return row;
  }

  function badgeChips(badges, skins = []) {
    if (!badges.length && !skins.length) return null;
    return h(
      'div.unlocks',
      badges.map((b) => h('div.unlock', h('span.medal', '★'), h('div', h('b', 'New badge: ' + b.name), h('div.small.muted', b.desc)))),
      skins.map((k) => h('div.unlock', h('span.medal.skin', '★'), h('div', h('b', 'New rocket colour: ' + k.name), h('div.small.muted', 'Choose it in Badges & rockets')))),
    );
  }

  function showWin({ newBadges, newSkins, improved, firstWin, streak, daily, rankUp, newCerts = [] }) {
    const praise = rankUp
      ? `Promoted! You are now a ${rankUp.name}.`
      : daily
        ? `Today’s mission complete! Daily streak: ${daily} day${daily > 1 ? 's' : ''}.`
        : improved
          ? `New personal best: ${game.stars} stars!`
          : streak >= 3
            ? `${streak} wins in a row! You are on fire.`
            : firstWin
              ? 'First time flying this mission. Well done!'
              : null;
    if (rankUp) setTimeout(() => sfx.unlock(), 1200);
    if (praise) setTimeout(() => speak(praise), 900);
    confetti(el);
    if (newBadges.length || newSkins.length) setTimeout(() => sfx.unlock(), 1600);
    const next = LEVELS[ri + 1];
    const ov = overlay([
      h('div.result-head', h('div.vyom-big', { innerHTML: vyomSVG('happy', 84) }), h('div', h('h2.ok', CHEERS[Math.floor(Math.random() * CHEERS.length)]), starRow(game.stars))),
      praise ? h('div.praise', praise) : null,
      h('ul.result-lines', game.result.map((r) => h('li', r))),
      badgeChips(newBadges, newSkins),
      newCerts.length ? h('div.unlocks', newCerts.map((c) => h('button.unlock.cert-unlock', { onclick: () => app.go('certs'), 'data-testid': 'cert-new' }, h('span.medal', { style: { background: c.color } }, '★'), h('div', h('b', `New certificate: ${c.tier} · ${c.title}`), h('div.small.muted', 'Tap to see it with your name on it'))))) : null,
      debrief(),
      h(
        'div.row.wrap.result-btns',
        h('button.btn', { onclick: () => replay(), 'data-testid': 'replay' }, '↺ Replay'),
        h('button.btn.primary.grow', { onclick: () => (ov.remove(), quizCard(next)), 'data-testid': 'continue' }, next ? 'Continue ▸' : 'Finish ▸'),
      ),
    ]);
  }

  /** Flight debrief: graph, star targets, and what the real mission did. */
  function debrief() {
    const b = briefFor(id);
    const graph = flightGraph(id, rec.points);
    if (!b && !graph) return h('div.fact', h('b', 'Real mission: '), L.fact);
    return h(
      'details.debrief',
      { open: true },
      h('summary', 'Flight debrief'),
      graph,
      b ? h('div.debrief-sec', h('div.small.muted', game.status === 'won' ? 'Star targets' : 'What to aim for'), starTargets(id, game.status === 'won' ? game.stars : 0)) : null,
      h('div.fact', h('b', 'What really happened: '), b?.history || L.fact),
    );
  }

  function quizCard(next) {
    const all = quiz.map((q, i) => ({ ...q, i }));
    // this mission's questions first, then general ones, never one you have already seen
    const q = prog.pickQuestion(all.filter((x) => x.level === id), all.length) || prog.pickQuestion(all.filter((x) => x.level === 'general'), all.length) || prog.pickQuestion(all, all.length);
    const goNext = () => (next ? flyTo(next) : app.go('home', { finished: true }));
    if (!q) return goNext();
    const opts = h('div.quiz-opts');
    const after = h('div.quiz-after');
    const ov = overlay([h('div.quiz-head', h('span.chip', 'Bonus question'), h('span.small.muted', `${prog.data.quizRight} right so far`)), h('h2.quiz-q', q.q), opts, after]);
    q.options.forEach((o, k) =>
      opts.appendChild(
        h(
          'button.btn.quiz-opt',
          {
            'data-testid': 'quiz-' + k,
            onclick: () => {
              const right = k === q.answer;
              right ? sfx.right() : sfx.wrong();
              opts.querySelectorAll('button').forEach((b, j) => {
                b.disabled = true;
                b.classList.toggle('right', j === q.answer);
                b.classList.toggle('wrong', j === k && !right);
              });
              const badges = prog.quiz(right, q.i, q.level);
              const card = prog.newCard ? h('div.unlock', h('span.medal.card', '★'), h('div', h('b', `History card unlocked: ${L.mission}`), h('div.small.muted', 'Read it in Badges & rockets'))) : null;
              put(after, h('p', h('b', right ? 'Correct! ' : 'Not quite. '), q.explain), card, badgeChips(badges, prog.newSkins || []), h('div.row', h('div.spacer'), h('button.btn.primary', { onclick: () => (ov.remove(), goNext()), 'data-testid': 'quiz-next' }, next ? `Next: ${next.title} ▸` : 'Back to levels ▸')));
            },
          },
          o,
        ),
      ),
    );
    opts.appendChild(h('button.btn.ghost.small', { onclick: () => (ov.remove(), goNext()), 'data-testid': 'quiz-skip' }, 'Skip'));
  }

  function showLose(badges) {
    setTimeout(() => speak(coachTip(id, game.reason) || game.reason), 500);
    const tries = prog.data.tries[id] || 0;
    overlay([
      h('div.result-head', h('div.vyom-big', { innerHTML: vyomSVG('sad', 84) }), h('div', h('h2.no', OOPS[Math.floor(Math.random() * OOPS.length)]), h('p', game.reason))),
      coachTip(id, game.reason) ? h('div.coach', h('b', 'Vyom explains: '), coachTip(id, game.reason)) : null,
      badgeChips(badges),
      debrief(),
      tries >= 2 ? h('p.small.muted', 'Stuck? Let Vyom show you how, then try again.') : null,
      h(
        'div.row.wrap.result-btns',
        h('button.btn', { onclick: () => app.go('home') }, 'Levels'),
        h('button.btn', { onclick: () => app.go('play', { id, demo: true }), 'data-testid': 'watch' }, 'Watch Vyom'),
        h('button.btn.primary.grow', { onclick: () => replay(), 'data-testid': 'retry' }, '↺ Try again'),
      ),
    ]);
  }

  function showDemoEnd() {
    overlay([
      h('div.result-head', h('div.vyom-big', { innerHTML: vyomSVG('happy', 84) }), h('div', h('h2', 'Your turn!'), h('p', game.status === 'won' ? 'See how I timed the button? Now you try.' : 'Hmm, even I missed that time. Try it yourself!'))),
      h('div.row.wrap.result-btns', h('button.btn', { onclick: () => app.go('home') }, 'Levels'), h('button.btn.primary.grow', { onclick: () => app.go('play', { id }), 'data-testid': 'retry' }, 'Let me fly ▸')),
    ]);
  }

  /** Celebration hop: a rocket flies from this mission to the next one on the timeline. */
  function flyTo(next) {
    const go = () => app.go('play', { id: next.id });
    if (document.body.classList.contains('reduce-motion')) return go();
    const c = h('canvas.fly-canvas', { 'aria-label': `Flying on to level ${ri + 2}: ${next.title}` });
    const ov = h('div.fly-ov', { onclick: () => finish() }, c, h('div.fly-skip.small', 'Tap to skip'));
    el.appendChild(ov);
    const sky = starField(260, 9);
    let t0 = 0, raf2 = 0, done = false;
    const DUR = 2.2;
    sfx.unlock();
    boostOn();
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf2);
      boostOff();
      go();
    }
    const nodes = [
      { L, n: ri + 1 },
      { L: next, n: ri + 2 },
    ];
    function frame2(now) {
      if (!t0) t0 = now;
      const t = Math.min(1, (now - t0) / 1000 / DUR);
      const { w, h: H, ctx } = fitCanvas(c);
      ctx.fillStyle = '#04060b';
      ctx.fillRect(0, 0, w, H);
      sky(ctx, w, H);
      const A = [w * 0.22, H * 0.72], B = [w * 0.78, H * 0.3], C = [w * 0.2, H * 0.18];
      const P = (u) => [(1 - u) ** 2 * A[0] + 2 * (1 - u) * u * C[0] + u * u * B[0], (1 - u) ** 2 * A[1] + 2 * (1 - u) * u * C[1] + u * u * B[1]];
      // dotted route
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = 'rgba(223,232,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const [x, y] = P(i / 60);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // the two missions
      nodes.forEach(({ L: Lv, n }, k) => {
        const [x, y] = k ? B : A;
        drawBody(ctx, BODY[Lv.id] || 'earth', x, y, 26, -2.3, { minR: 26 });
        ctx.textAlign = 'center';
        ctx.fillStyle = k ? '#ff9933' : '#8d9cb5';
        ctx.font = '700 12px Inter, system-ui, sans-serif';
        ctx.fillText(`LEVEL ${n} · ${Lv.year}`, x, y + 46);
        ctx.fillStyle = '#e7eef8';
        ctx.font = '800 15px Inter, system-ui, sans-serif';
        ctx.fillText(Lv.title, x, y + 64);
        ctx.textAlign = 'left';
      });
      // the rocket, easing in and out, with a flame trail
      const u = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const [x, y] = P(u), [x2, y2] = P(Math.min(1, u + 0.01));
      ctx.strokeStyle = 'rgba(255,153,51,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const [tx, ty] = P(Math.max(0, u - 0.25 + (0.25 * i) / 30));
        i ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty);
      }
      ctx.stroke();
      renderer.rocket(ctx, x, y, Math.atan2(y2 - y, x2 - x), skin, true, 18);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffcc4d';
      ctx.font = '800 18px Inter, system-ui, sans-serif';
      ctx.fillText('Next mission!', w / 2, H * 0.9);
      ctx.textAlign = 'left';
      if (t >= 1) return setTimeout(finish, 350);
      raf2 = requestAnimationFrame(frame2);
    }
    raf2 = requestAnimationFrame(frame2);
  }

  function replay() {
    app.go('play', { id });
  }
  function leave() {
    app.go('home');
  }

  return {
    el,
    mounted() {
      raf = requestAnimationFrame(frame);
      intro();
    },
    destroy() {
      cancelAnimationFrame(raf);
      boostOff();
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
    },
    onPause() {
      hold = false;
      boostOff();
    },
    get game() {
      return game;
    },
    startNow: () => (g.hide(), start(true)),
  };
}

/** Celebration confetti (lightweight canvas overlay). */
function confetti(host) {
  if (document.body.classList.contains('reduce-motion')) return;
  const c = h('canvas.confetti');
  host.appendChild(c);
  const { w, h: H, ctx } = fitCanvas(c);
  const cols = ['#ff9933', '#ffffff', '#138808', '#4cc9f0', '#ffcc4d', '#ff5c8a'];
  const ps = Array.from({ length: 140 }, () => ({ x: w / 2 + (Math.random() - 0.5) * 60, y: H * 0.35, vx: (Math.random() - 0.5) * 520, vy: -Math.random() * 520 - 120, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12, c: cols[(Math.random() * cols.length) | 0], s: 5 + Math.random() * 6 }));
  let t0 = 0;
  const step = (now) => {
    const dt = Math.min(0.04, (now - (t0 || now)) / 1000);
    t0 = now;
    ctx.clearRect(0, 0, w, H);
    let alive = false;
    for (const p of ps) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (p.y < H + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (alive && c.isConnected) requestAnimationFrame(step);
    else c.remove();
  };
  requestAnimationFrame(step);
}
