/**
 * Quiz to Orbit: a little launch game powered by quiz answers.
 * Three answer gates fly toward your rocket; steer into the right one.
 * Right answer = an engine burn (+0.9 km/s). Wrong answer = gravity losses (−0.3 km/s).
 * Reach 7.8 km/s, the real speed for an orbit just above Earth, to win.
 */
import { h, clear, put, fitCanvas } from '../dom.js';
import { progress } from '../../game/progress.js';
import { levelById } from '../../arcade/levels.js';
import { createRenderer } from '../../arcade/draw.js';
import { drawBody, starField } from '../render.js';
import { vyomSVG } from '../guide.js';
import { sfx, boostOn, boostOff, setMood } from '../audio.js';
import quizBank from '../../../content/quiz.json';

const ORBIT = 7.8, BURN = 0.9, LOSS = 0.3, MAX_WRONG = 4, MAX_Q = 14;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function quizGameScreen(app) {
  const prog = progress(app);
  const skin = prog.skin();
  const r = createRenderer();
  const stars = starField(380, 21);
  // questions you have not seen come first; a full round is completed before any repeat
  if (prog.data.quizSeen.length >= quizBank.length) prog.data.quizSeen = [];
  const all = quizBank.map((q, i) => ({ ...q, i }));
  const deck = [...shuffle(all.filter((q) => !prog.data.quizSeen.includes(q.i))), ...shuffle(all.filter((q) => prog.data.quizSeen.includes(q.i)))];
  let qi = -1, speed = 0, wrong = 0, right = 0, lane = 1, laneX = 1, gateT = 0, gateDur = 9, cur = null, opts = [], state = 'intro', raf = 0, last = 0, flash = 0, scroll = 0;

  const canvas = h('canvas.play-canvas', { 'aria-hidden': 'true' });
  const qCard = h('div.qg-q');
  const gates = h('div.qg-gates');
  const meterFill = h('div.qg-fill');
  const meterVal = h('div.qg-val', '0.0 km/s');
  const hearts = h('div.qg-hearts');
  const msg = h('div.qg-msg');
  const el = h(
    'div.screen.full.play.qg',
    canvas,
    h('div.play-top', h('button.btn.icon.sm.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('div.play-title', h('div.lvl', 'Quiz game'), h('div.t', 'Quiz to Orbit')), hearts),
    h('div.qg-meter', { 'aria-label': 'Speed toward orbit' }, h('div.qg-bar', meterFill, h('div.qg-mark', { style: { bottom: '100%' } }, 'Orbit 7.8')), meterVal),
    qCard,
    gates,
    msg,
  );

  function paintHearts() {
    clear(hearts);
    for (let i = 0; i < MAX_WRONG; i++) hearts.appendChild(h('span.life' + (i < MAX_WRONG - wrong ? '.on' : '')));
  }
  function paintMeter() {
    meterFill.style.height = `${Math.min(100, (speed / ORBIT) * 100)}%`;
    meterVal.textContent = `${speed.toFixed(1)} km/s`;
  }

  function nextQuestion() {
    qi++;
    if (qi >= MAX_Q || qi >= deck.length) return finish(false, 'Out of questions before reaching orbit. Try again for more right answers!');
    cur = deck[qi];
    // three gates: the right answer + two wrong ones, in random lanes
    const wrongs = shuffle(cur.options.map((o, k) => k).filter((k) => k !== cur.answer)).slice(0, 2);
    opts = shuffle([cur.answer, ...wrongs]);
    clear(qCard);
    const lv = levelById(cur.level);
    const hintTxt = h('div.qg-hint');
    const hintBtn = h('button.btn.sm.ghost.hint-btn', { 'data-testid': 'qg-hint', disabled: prog.hintsLeft() <= 0, onclick: (e) => {
      e.stopPropagation();
      if (state !== 'gates' || !prog.useHint()) return;
      sfx.tap();
      hintTxt.textContent = 'Hint: ' + (cur.hint || 'Think it through!');
      hintBtn.disabled = true;
      hintBtn.textContent = `Hint used (${prog.hintsLeft()} left)`;
    } }, `Hint (${prog.hintsLeft()} of 3)`);
    put(qCard, h('div.qg-num', `Question ${qi + 1}` + (lv ? ` · ${lv.mission}` : ''), hintBtn), h('div.qg-text', cur.q), hintTxt);
    clear(gates);
    opts.forEach((k, li) => gates.appendChild(h('button.qg-gate', { 'data-testid': 'gate-' + li, 'data-right': k === cur.answer ? '1' : '0', onpointerdown: () => steer(li), onclick: () => steer(li) }, cur.options[k])));
    lane = -1;
    gateT = 0;
    gateDur = Math.max(5, 9 - right * 0.35);
    state = 'gates';
  }

  function steer(li) {
    if (state !== 'gates') return;
    lane = li;
    sfx.tap();
    gates.querySelectorAll('.qg-gate').forEach((g, j) => g.classList.toggle('picked', j === li));
  }

  function resolve() {
    state = 'result';
    const ok = lane >= 0 && opts[lane] === cur.answer;
    gates.querySelectorAll('.qg-gate').forEach((g, j) => {
      g.classList.toggle('right', opts[j] === cur.answer);
      g.classList.toggle('wrong', j === lane && !ok);
    });
    const badges = prog.quiz(ok, cur.i, cur.level, true);
    if (prog.newCard) setTimeout(() => app.toast(`History card unlocked: ${levelById(prog.newCard)?.title}`, 2600, 'happy'), 400);
    for (const k of prog.newSkins || []) setTimeout(() => app.toast(`New rocket colour: ${k.name}`, 2600, 'happy'), 900);
    if (ok) {
      right++;
      speed += BURN;
      flash = 1.2;
      sfx.right();
      boostOn();
      setTimeout(boostOff, 900);
      say('happy', `Burn! +${BURN} km/s. ${cur.explain}`);
    } else {
      wrong++;
      speed = Math.max(0, speed - LOSS);
      sfx.wrong();
      app.vibrate(60);
      say('sad', `${lane < 0 ? 'No gate chosen!' : 'Not quite.'} Gravity slows you (−${LOSS} km/s). ${cur.explain}`);
    }
    for (const b of badges) app.toast(`New badge: ${b.name}`, 2500, 'happy');
    paintHearts();
    paintMeter();
    setTimeout(() => {
      clear(msg);
      if (speed >= ORBIT - 1e-9) return finish(true);
      if (wrong >= MAX_WRONG) return finish(false, 'Too many wrong answers: gravity pulled the rocket back down. Try again!');
      nextQuestion();
    }, 2600);
  }

  function say(mood, text) {
    clear(msg);
    const face = h('span.toast-vyom');
    face.innerHTML = vyomSVG(mood, 40);
    put(msg, h('div.qg-say', face, h('span', text)));
  }

  function finish(won, reason) {
    state = 'end';
    boostOff();
    const st = won ? (wrong === 0 ? 3 : wrong <= 2 ? 2 : 1) : 0;
    const rec = prog.quizGame(st);
    won ? sfx.win() : sfx.lose();
    const face = h('div.vyom-big');
    face.innerHTML = vyomSVG(won ? 'happy' : 'sad', 84);
    const ov = h(
      'div.overlay.result',
      h(
        'div.modal.result-card',
        h('div.result-head', face, h('div', h('h2' + (won ? '.ok' : '.no'), won ? 'In orbit! ' : 'Fell back to Earth'), won ? h('div.star-row', [0, 1, 2].map((i) => h('span.star' + (i < st ? '.on.pop' : ''), '★'))) : h('p', reason))),
        h('ul.result-lines', h('li', `Right answers: ${right} · wrong: ${wrong}`), h('li', `Top speed: ${speed.toFixed(1)} km/s (orbit needs about 7.8 km/s)`)),
        h('div.fact', h('b', 'Real physics: '), 'a real rocket must reach about 7.8 km/s sideways to orbit Earth, and loses another 1.5–2 km/s to gravity and air on the way up.'),
        rec.newSkins.length || rec.newBadges.length ? h('div.unlocks', rec.newSkins.map((k) => h('div.unlock', h('span.medal.skin', '★'), h('div', h('b', 'New rocket colour: ' + k.name)))), rec.newBadges.map((b) => h('div.unlock', h('span.medal', '★'), h('div', h('b', 'New badge: ' + b.name))))) : null,
        h('div.row.wrap.result-btns', h('button.btn', { onclick: () => app.go('home') }, 'Home'), h('button.btn.primary.grow', { onclick: () => app.go('quizgame'), 'data-testid': 'qg-again' }, '↺ Play again')),
      ),
    );
    el.appendChild(ov);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (state === 'gates') {
      gateT += dt;
      if (gateT >= gateDur) resolve();
    }
    const p = state === 'gates' ? Math.min(1, gateT / gateDur) : state === 'result' ? 1 : 0;
    gates.style.setProperty('--p', p);
    flash = Math.max(0, flash - dt);
    const { w, h: H, ctx } = fitCanvas(canvas);
    // sky darkens as you speed up; Earth sinks away below
    const k = Math.min(1, speed / ORBIT);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgb(${Math.round(30 * (1 - k))},${Math.round(70 * (1 - k)) + 4},${Math.round(140 * (1 - k)) + 11})`);
    sky.addColorStop(1, `rgb(${Math.round(90 * (1 - k)) + 4},${Math.round(150 * (1 - k)) + 6},${Math.round(220 * (1 - k)) + 11})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, H);
    scroll += dt * (20 + speed * 60);
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.75 * k;
    ctx.translate(0, scroll % H);
    stars(ctx, w, H);
    ctx.translate(0, -H);
    stars(ctx, w, H);
    ctx.restore();
    const er = w * (0.62 + 0.4 * (1 - k));
    drawBody(ctx, 'earth', w / 2, H + er * 0.55 - H * (0.12 - 0.08 * k), er, -Math.PI / 2, { dpr: 1 });
    // rocket slides to the chosen lane
    const target = lane >= 0 ? lane : 1;
    laneX += (target - laneX) * Math.min(1, dt * 8);
    const rx = w * (0.2 + 0.3 * laneX), ry = H * 0.8;
    r.rocket(ctx, rx, ry, -Math.PI / 2, skin, flash > 0 || state === 'intro', 22);
  }

  function intro() {
    const face = h('div.vyom-big');
    face.innerHTML = vyomSVG('happy', 84);
    const ov = h(
      'div.overlay.result',
      h(
        'div.modal.result-card',
        h('div.result-head', face, h('div', h('h2', 'Quiz to Orbit'), h('p', 'Answer right to power your rocket into orbit!'))),
        h('ul.result-lines', h('li', 'Three answer gates fly toward you: tap the right one before they arrive.'), h('li', `Right answer = engine burn (+${BURN} km/s).`), h('li', `Wrong answer = gravity slows you (−${LOSS} km/s). ${MAX_WRONG} lives.`), h('li', 'Reach 7.8 km/s, the real speed of an orbit!')),
        h('div.row.result-btns', h('div.spacer'), h('button.btn.primary', { 'data-testid': 'qg-start', onclick: () => (ov.remove(), nextQuestion()) }, 'Launch! ▸')),
      ),
    );
    el.appendChild(ov);
  }

  paintHearts();
  paintMeter();
  return {
    el,
    tourDelay: 300,
    tour: [
      { sel: '.qg-meter, .qg-bar', title: 'Speed meter', text: 'Every right answer is a burn that adds speed. Reach 7.8 km/s to be in orbit.' },
      { sel: '.qg-hearts', title: 'Lives', text: 'A wrong answer costs a life. Lose them all and the rocket falls back.' },
      { sel: '.hint-btn', title: 'Hints', text: 'You get 3 hints for every 6 questions. They refresh after every six.' },
    ],
    mounted() {
      setMood('play');
      raf = requestAnimationFrame(frame);
      intro();
    },
    destroy() {
      cancelAnimationFrame(raf);
      boostOff();
    },
    get state() {
      return state;
    },
  };
}
