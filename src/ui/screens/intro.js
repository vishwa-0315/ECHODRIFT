/** Intro: welcome slides for new players (Skip any time). Shown once; Settings can replay it. */
import { h } from '../dom.js';
import { vyomSVG, speak } from '../guide.js';
import { sfx, unlockAudio } from '../audio.js';
import { RANKS, RANK_TIERS } from '../../game/progress.js';
import { emblemSVG } from '../rankBadge.js';

const ART = {
  physics:
    '<svg viewBox="0 0 220 120" aria-hidden="true"><circle cx="70" cy="62" r="24" fill="#3a7bd5"/><path d="M52 52c8 4 18 2 26-6M50 70c10 2 20 8 34 4" stroke="#7ec850" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="78" cy="62" rx="70" ry="40" fill="none" stroke="#8d9cb5" stroke-width="1.5" stroke-dasharray="4 6"/><path d="M148 62 a70 40 0 0 1 -12 22" stroke="#ff9933" stroke-width="3" fill="none"/><g transform="translate(148 60) rotate(100)"><path d="M0 -9 L5 6 L-5 6 Z" fill="#e7eef8"/><path d="M-3 7 L0 16 L3 7 Z" fill="#ff9933"/></g><circle cx="196" cy="22" r="10" fill="#c9c9c9"/></svg>',
  controls:
    '<svg viewBox="0 0 220 120" aria-hidden="true"><rect x="12" y="34" width="92" height="52" rx="14" fill="#ff9933"/><text x="58" y="66" font-size="15" font-weight="700" text-anchor="middle" fill="#1a0d00" font-family="sans-serif">HOLD</text><rect x="116" y="34" width="92" height="52" rx="14" fill="#1f2c45" stroke="#ff9933" stroke-width="2"/><text x="162" y="66" font-size="15" font-weight="700" text-anchor="middle" fill="#ff9933" font-family="sans-serif">TAP</text><rect x="30" y="100" width="160" height="6" rx="3" fill="#1f2c45"/><circle cx="120" cy="103" r="9" fill="#ff9933"/></svg>',
};

const SLIDES = [
  { k: 'hello', title: 'Namaste! I am Vyom', text: 'Welcome to Launch Window. You will fly 30 real missions of ISRO and NASA, from Apollo 8 in 1968 to SpaDeX in 2025. I will be your mission buddy.' },
  { k: 'physics', title: 'Real physics, no tricks', text: 'Gravity, engines and fuel all follow the real laws of physics. The dotted line shows where your spacecraft will go. Burn at the right moment and the line moves.' },
  { k: 'controls', title: 'Simple controls', text: 'Most missions need one button: hold it to fire the engine, or tap it at the right moment. Some use two buttons, a slider to tilt the rocket, or a tap on the map.' },
  { k: 'ranks', title: 'Stars and ranks', text: 'Win up to 3 stars on every mission. Stars raise your rank: Bronze, Silver, Gold, Platinum, Diamond, Space Walker, Elite Space Walker, Space Master, Elite Space Master, and Grandmaster for true professionals.' },
  { k: 'demo', title: 'I will show you how', text: 'Before your first try on a mission, I fly it once so you can watch. If you miss, I can show you again. Press Skip any time to fly it yourself.' },
  { k: 'pages', title: 'Your mission control', text: 'The Menu leads to every page: Levels, Quiz to Orbit, Profile, Certificates, Badges, Settings and more. Each page has a short tour the first time, with a Skip button.' },
];

export function introScreen(app, { replay = false } = {}) {
  let i = 0;
  const art = h('div.intro-art');
  const title = h('h2.intro-title');
  const text = h('p.intro-text');
  const dots = h('div.intro-dots', { role: 'tablist', 'aria-label': 'Intro slides' }, SLIDES.map((s, k) => h('button.dot', { role: 'tab', 'aria-label': `Slide ${k + 1}: ${s.title}`, onclick: () => show(k) })));
  const back = h('button.btn', { 'data-testid': 'intro-back', onclick: () => show(i - 1) }, 'Back');
  const next = h('button.btn.primary.grow', { 'data-testid': 'intro-next', onclick: () => (i < SLIDES.length - 1 ? show(i + 1) : finish()) }, 'Next');
  const skip = h('button.btn.ghost.intro-skip', { 'data-testid': 'intro-skip', onclick: () => finish() }, 'Skip');
  const card = h('div.intro-card', art, title, text);
  const el = h('div.screen.intro', h('div.intro-top', h('span.label', 'How to play'), skip), card, dots, h('div.row.intro-btns', back, next));

  function drawArt(k) {
    art.innerHTML = '';
    if (k === 'hello' || k === 'demo') art.innerHTML = vyomSVG(k === 'hello' ? 'happy' : 'wow', 120);
    else if (ART[k]) art.innerHTML = ART[k];
    else if (k === 'ranks') art.appendChild(h('div.intro-emblems', RANK_TIERS.map((t) => h('span', { title: t.tier, innerHTML: emblemSVG(RANKS.find((r) => r.tier === t.tier), 40) }))));
    else if (k === 'pages') art.appendChild(h('div.intro-pages', ['Menu', 'Levels', 'Quiz', 'Profile', 'Certificates', 'Settings'].map((p) => h('span.chip', p))));
  }
  function show(k) {
    i = Math.max(0, Math.min(SLIDES.length - 1, k));
    const s = SLIDES[i];
    drawArt(s.k);
    title.textContent = s.title;
    text.textContent = s.text;
    card.classList.remove('in');
    void card.offsetWidth;
    card.classList.add('in');
    back.disabled = i === 0;
    next.textContent = i === SLIDES.length - 1 ? 'Let’s fly ▸' : 'Next';
    [...dots.children].forEach((d, n) => d.setAttribute('aria-selected', String(n === i)));
    speak(s.title + '. ' + s.text);
    sfx.tap();
  }
  function finish() {
    unlockAudio();
    app.setSetting('introDone', true);
    app.go('home');
  }
  // swipe between slides
  let x0 = null;
  card.addEventListener('pointerdown', (e) => (x0 = e.clientX));
  card.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
  });
  const key = (e) => {
    if (e.key === 'ArrowRight') next.click();
    else if (e.key === 'ArrowLeft' && i > 0) back.click();
    else if (e.key === 'Escape') finish();
  };
  window.addEventListener('keydown', key);
  return {
    el,
    mounted: () => (show(0), next.focus()),
    destroy: () => window.removeEventListener('keydown', key),
    replay,
  };
}
