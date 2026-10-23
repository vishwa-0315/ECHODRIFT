/** Vyom ("sky" in Sanskrit/Hindi): the friendly robot guide. Original character, drawn in SVG. */
import { h } from './dom.js';

const EYES = {
  happy: '<path d="M37 47 q5 -6 10 0" stroke="#7ff3ff" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M53 47 q5 -6 10 0" stroke="#7ff3ff" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
  normal: '<ellipse cx="42" cy="46" rx="4" ry="5" fill="#7ff3ff"/><ellipse cx="58" cy="46" rx="4" ry="5" fill="#7ff3ff"/><circle cx="43.3" cy="44.2" r="1.3" fill="#fff"/><circle cx="59.3" cy="44.2" r="1.3" fill="#fff"/>',
  sad: '<path d="M37 45 q5 4 10 0" stroke="#7ff3ff" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M53 45 q5 4 10 0" stroke="#7ff3ff" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
  wow: '<circle cx="42" cy="46" r="5" fill="#7ff3ff"/><circle cx="58" cy="46" r="5" fill="#7ff3ff"/><circle cx="43.5" cy="44.5" r="1.6" fill="#fff"/><circle cx="59.5" cy="44.5" r="1.6" fill="#fff"/>',
};
const MOUTH = {
  happy: '<path d="M44 56 q6 6 12 0" stroke="#7ff3ff" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
  normal: '<path d="M45 57 q5 3 10 0" stroke="#7ff3ff" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  sad: '<path d="M45 59 q5 -4 10 0" stroke="#7ff3ff" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  wow: '<ellipse cx="50" cy="58" rx="3.2" ry="3.8" fill="#7ff3ff"/>',
};

export function vyomSVG(mood = 'normal', size = 72) {
  return `<svg class="vyom" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
  <line x1="50" y1="20" x2="50" y2="9" stroke="#c9d4e6" stroke-width="3"/>
  <circle class="vyom-tip" cx="50" cy="8" r="5" fill="#ff9933"/>
  <ellipse cx="50" cy="93" rx="22" ry="4" fill="rgba(0,0,0,0.35)"/>
  <rect x="30" y="66" width="40" height="24" rx="11" fill="#e9eef7"/>
  <rect x="44" y="72" width="12" height="7" rx="2" fill="#ff9933"/>
  <circle cx="50" cy="48" r="30" fill="#f4f7fc"/>
  <circle cx="50" cy="48" r="30" fill="none" stroke="#c9d4e6" stroke-width="2"/>
  <rect x="28" y="33" width="44" height="32" rx="15" fill="#0b1a33"/>
  ${EYES[mood] || EYES.normal}${MOUTH[mood] || MOUTH.normal}
  <circle cx="22" cy="48" r="5" fill="#c9d4e6"/><circle cx="78" cy="48" r="5" fill="#c9d4e6"/>
</svg>`;
}

/**
 * A guide bubble: Vyom + speech. lines = array of strings, shown one at a time
 * (tap to continue). Returns { el, say(lines, mood), hide() }.
 */
export function guide({ compact = false } = {}) {
  const face = h('div.vyom-face');
  const text = h('div.bubble-text');
  const next = h('div.bubble-next', '▸');
  const bubble = h('div.bubble', text, next);
  const el = h('div.guide' + (compact ? '.compact' : ''), { role: 'status', 'aria-live': 'polite' }, face, bubble);
  let queue = [], onDone = null;
  function show() {
    if (!queue.length) {
      el.classList.remove('show');
      onDone?.();
      onDone = null;
      return;
    }
    text.textContent = queue.shift();
    next.style.visibility = queue.length ? 'visible' : 'hidden';
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('show', 'pop');
  }
  el.addEventListener('click', show);
  return {
    el,
    say(lines, mood = 'normal', done) {
      face.innerHTML = vyomSVG(mood, compact ? 54 : 72);
      queue = Array.isArray(lines) ? [...lines] : [lines];
      onDone = done || null;
      show();
    },
    hide() {
      queue = [];
      el.classList.remove('show');
    },
    get open() {
      return el.classList.contains('show');
    },
  };
}
