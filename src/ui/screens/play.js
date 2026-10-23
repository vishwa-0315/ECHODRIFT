/** Quick-play level screen: one big button, a fuel bar, Vyom's tips, stars, quiz card. */
import { h, clear, put, fitCanvas } from '../dom.js';
import { levelById, LEVELS } from '../../arcade/levels.js';
import { createRenderer } from '../../arcade/draw.js';
import { progress } from '../../game/progress.js';
import { guide, vyomSVG } from '../guide.js';
import { sfx, boostOn, boostOff, setMood, unlockAudio } from '../audio.js';
import quiz from '../../../content/quiz.json';

const CHEERS = ['Brilliant flying!', 'Wow, just like the real mission!', 'You are a natural!', 'Mission control is cheering!'];
const OOPS = ['Oops! Space is tricky.', 'Close one! Let’s try again.', 'Even real missions need practice.'];

export function playScreen(app, { id, demo = false }) {
  const L = levelById(id);
  const prog = progress(app);
  const skin = prog.skin();
  const ri = LEVELS.indexOf(L);
  let game = L.create();
  const renderer = createRenderer();
  let running = false, raf = 0, last = 0, ended = false;
  let hold = false, tapQueued = false, aim = 0;
  let demoMode = demo;

  const canvas = h('canvas.play-canvas', { 'aria-label': `${L.title}: game view` });
  const g = guide();
  const info = h('div.play-info');
  const fuelFill = h('div.fuel-fill');
  const fuel = h('div.fuel', h('span.fuel-label', '⛽ Fuel'), h('div.fuel-bar', fuelFill));
  const light = h('div.chute-light', { style: { display: 'none' } });
  const alertEl = h('div.play-alert');
  const demoBanner = h('div.demo-banner', { style: { display: demoMode ? '' : 'none' } }, '👀 Vyom is flying. Watch the button!');
  const mainBtn = h('button.big-btn', { 'data-testid': 'main-btn' }, h('span.big-label', L.button));
  const aimInput = h('input', { type: 'range', min: -1, max: 1, step: 0.005, value: 0, 'aria-label': 'Aim', 'data-testid': 'aim' });
  const nudge = (d) => () => ((aimInput.value = Math.max(-1, Math.min(1, +aimInput.value + d))), (aim = +aimInput.value), sfx.tap());
  const aimRow = h('div.aim-row', { style: { display: L.control === 'aim+tap' ? '' : 'none' } }, h('button.btn.icon.sm', { onclick: nudge(-0.01), 'aria-label': 'Aim left a little' }, '−'), aimInput, h('button.btn.icon.sm', { onclick: nudge(0.01), 'aria-label': 'Aim right a little' }, '+'));
  aimInput.addEventListener('input', () => (aim = +aimInput.value));

  const el = h(
    'div.screen.full.play',
    canvas,
    h('div.play-top', h('button.btn.icon.sm.ghost', { 'aria-label': 'Back to levels', onclick: () => leave() }, '✕'), h('div.play-title', h('div.lvl', `Level ${ri + 1} · ${L.mission}`), h('div.t', L.title)), h('div.play-goal-stars', '☆☆☆')),
    h('div.play-hud', info, fuel, light),
    alertEl,
    demoBanner,
    h('div.play-bottom', g.el, aimRow, mainBtn),
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
      let input = { hold, tap: tapQueued, aim };
      if (demoMode) {
        const b = game.bot();
        input = { hold: !!b.hold, tap: !!b.tap, aim: b.aim ?? 0 };
        mainBtn.classList.toggle('pressed', !!b.hold || !!b.tap);
        if (b.aim != null) aimInput.value = b.aim;
      }
      tapQueued = false;
      const wasPhase = game.phase;
      game.update(dt, input);
      if (game.phase === 'chute' && wasPhase === 'entry') sfx.chute();
      if (game.burning) boostOn();
      else boostOff();
      if (game.status !== 'play') end();
    }
    const r = fitCanvas(canvas);
    const top = el.querySelector('.play-hud')?.getBoundingClientRect().bottom ?? 120;
    const bottom = el.querySelector('.play-bottom')?.getBoundingClientRect().top ?? r.h - 120;
    renderer.draw(r.ctx, r.w, r.h, game, skin, { top, bottom, dpr: r.dpr });
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
    const label = game.button || L.button;
    const lab = mainBtn.querySelector('.big-label');
    if (lab.textContent !== label) lab.textContent = label;
    mainBtn.disabled = game.phase === 'chute';
  }

  /* ---------- start / end ---------- */
  function start() {
    running = true;
    last = 0;
    setMood('play');
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
    hold = false;
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
      badges.map((b) => h('div.unlock', h('span.ic', b.icon), h('div', h('b', 'New badge: ' + b.name), h('div.small.muted', b.desc)))),
      skins.map((k) => h('div.unlock', h('span.ic', '🎨'), h('div', h('b', 'New rocket colour: ' + k.name), h('div.small.muted', 'Choose it in Badges & rockets')))),
    );
  }

  function showWin({ newBadges, newSkins }) {
    confetti(el);
    if (newBadges.length || newSkins.length) setTimeout(() => sfx.unlock(), 1600);
    const next = LEVELS[ri + 1];
    const ov = overlay([
      h('div.result-head', h('div.vyom-big', { innerHTML: vyomSVG('happy', 84) }), h('div', h('h2.ok', CHEERS[Math.floor(Math.random() * CHEERS.length)]), starRow(game.stars))),
      h('ul.result-lines', game.result.map((r) => h('li', r))),
      h('div.fact', h('b', 'Real mission: '), L.fact),
      badgeChips(newBadges, newSkins),
      h(
        'div.row.wrap.result-btns',
        h('button.btn', { onclick: () => replay(), 'data-testid': 'replay' }, '↺ Replay'),
        h('button.btn.primary.grow', { onclick: () => (ov.remove(), quizCard(next)), 'data-testid': 'continue' }, next ? 'Continue ▸' : 'Finish ▸'),
      ),
    ]);
  }

  function quizCard(next) {
    const pool = quiz.map((q, i) => ({ ...q, i })).filter((q) => q.level === id);
    const unseen = pool.filter((q) => !prog.data.quizSeen.includes(q.i));
    const q = (unseen.length ? unseen : pool)[Math.floor(Math.random() * (unseen.length || pool.length))];
    const goNext = () => (next ? app.go('play', { id: next.id }) : app.go('home', { finished: true }));
    if (!q) return goNext();
    const opts = h('div.quiz-opts');
    const after = h('div.quiz-after');
    const ov = overlay([h('div.quiz-head', h('span.chip', '🧠 Bonus question'), h('span.small.muted', `${prog.data.quizRight} right so far`)), h('h2.quiz-q', q.q), opts, after]);
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
              const badges = prog.quiz(right, q.i);
              put(after, h('p', h('b', right ? '✅ Correct! ' : '❌ Not quite. '), q.explain), badgeChips(badges), h('div.row', h('div.spacer'), h('button.btn.primary', { onclick: () => (ov.remove(), goNext()), 'data-testid': 'quiz-next' }, next ? `Next: ${next.title} ▸` : 'Back to levels ▸')));
            },
          },
          o,
        ),
      ),
    );
    opts.appendChild(h('button.btn.ghost.small', { onclick: () => (ov.remove(), goNext()), 'data-testid': 'quiz-skip' }, 'Skip'));
  }

  function showLose(badges) {
    const tries = prog.data.tries[id] || 0;
    overlay([
      h('div.result-head', h('div.vyom-big', { innerHTML: vyomSVG('sad', 84) }), h('div', h('h2.no', OOPS[Math.floor(Math.random() * OOPS.length)]), h('p', game.reason))),
      badgeChips(badges),
      tries >= 2 ? h('p.small.muted', 'Stuck? Let Vyom show you how, then try again.') : null,
      h(
        'div.row.wrap.result-btns',
        h('button.btn', { onclick: () => app.go('home') }, 'Levels'),
        h('button.btn', { onclick: () => app.go('play', { id, demo: true }), 'data-testid': 'watch' }, '👀 Watch Vyom'),
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
    startNow: () => (g.hide(), start()),
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
