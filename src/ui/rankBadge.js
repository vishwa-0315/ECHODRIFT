/**
 * Rank emblem and rank card. Each tier has its own shield; higher tiers get
 * wings, then a crown; the division (I–IV) is shown as chevrons and the
 * rank stars inside a division fill up as you earn mission stars.
 */
import { h } from './dom.js';
import { RANKS, RANK_TIERS } from '../game/progress.js';

const TIER_INDEX = Object.fromEntries(RANK_TIERS.map((t, i) => [t.tier, i]));

/** SVG emblem for a rank (tier + division). size in px. */
export function emblemSVG(rank, size = 64) {
  const ti = TIER_INDEX[rank.tier] ?? 0;
  const c = rank.color;
  const divN = rank.div ? ['I', 'II', 'III', 'IV'].indexOf(rank.div) + 1 : 0;
  const wings = ti >= 5; // Space Walker and above
  const crown = ti >= 7; // Space Master and above
  const gm = rank.tier === 'Grandmaster';
  const chev = Array.from({ length: divN }, (_, i) => `<path d="M38 ${71 - i * 7} l12 -5 l12 5" fill="none" stroke="#0b1020" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const wing = (s) => `<g transform="translate(50 50) scale(${s} 1) translate(-50 -50)"><path d="M24 40 C10 36 4 26 2 18 C10 24 16 26 22 27 C14 22 10 16 9 10 C17 17 22 20 27 22 Z" fill="${c}" opacity="0.85"/></g>`;
  const star5 = (cx, cy, r, f) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1);
    }
    return `<path d="${d}Z" fill="${f}"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
  <defs><linearGradient id="eg${ti}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0.75"/></linearGradient></defs>
  ${wings ? wing(1) + wing(-1) : ''}
  <path d="M50 8 L80 20 L80 50 C80 70 66 84 50 92 C34 84 20 70 20 50 L20 20 Z" fill="url(#eg${ti})" stroke="#0b1020" stroke-width="3"/>
  <path d="M50 16 L73 25 L73 50 C73 65 62 77 50 84 C38 77 27 65 27 50 L27 25 Z" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.5"/>
  ${star5(50, 42, gm ? 17 : 12, '#0b1020')}${star5(50, 42, gm ? 11 : 7, '#fff')}
  ${chev}
  ${crown ? `<path d="M34 10 L40 0 L50 8 L60 0 L66 10 Z" fill="${gm ? '#fff3b0' : c}" stroke="#0b1020" stroke-width="2.5" stroke-linejoin="round"/>` : ''}
  </svg>`;
}

/** Rank stars inside the division: ★★☆ */
export function rankStars(rank) {
  return h('span.rank-stars', { 'aria-label': `${rank.filled} of ${rank.slots} rank stars` }, Array.from({ length: rank.slots }, (_, i) => h('span' + (i < rank.filled ? '.on' : ''), '★')));
}

/** Rank card used on the Menu and Profile pages. */
export function rankCard(rank, total, { onclick, big = false } = {}) {
  const nx = rank.next;
  const pct = nx ? ((total - rank.need) / (nx.need - rank.need)) * 100 : 100;
  const msg = nx ? (nx.pro ? 'Win every level with 3 stars and fly all Expert missions to become Grandmaster' : `${nx.need - total} more star${nx.need - total > 1 ? 's' : ''} to ${nx.name}`) : 'Grandmaster: the top rank. Every mission mastered.';
  return h(
    (onclick ? 'button' : 'div') + '.rank-card' + (big ? '.big' : ''),
    { 'aria-label': `Rank: ${rank.name}. ${msg}`, 'data-testid': 'rank-card', onclick, style: { '--tier': rank.color } },
    h('div.emblem', { innerHTML: emblemSVG(rank, big ? 92 : 60) }),
    h('div.grow', h('div.small.muted', 'Pilot rank'), h('div.rk-name', rank.name), rankStars(rank), h('div.small.muted', msg), h('div.rank-bar', h('div', { style: { width: pct + '%' } }))),
  );
}

/** Full ladder: every tier with its emblem; reached tiers are lit. */
export function rankLadder(rank) {
  return h(
    'ol.rank-ladder',
    RANK_TIERS.map((t) => {
      const first = RANKS.find((r) => r.tier === t.tier);
      const divs = RANKS.filter((r) => r.tier === t.tier);
      const reached = rank.index >= RANKS.indexOf(first);
      const cur = rank.tier === t.tier;
      return h(
        'li' + (reached ? '.got' : '') + (cur ? '.cur' : ''),
        { style: { '--tier': t.color } },
        h('span.emblem', { innerHTML: emblemSVG({ ...first, div: cur ? rank.div : first.div }, 44) }),
        h('div.grow', h('b', t.tier), h('div.small.muted', t.pro ? 'All 90 stars and every Expert mission' : `${divs.map((d) => d.div).join(' · ')} · from ${t.from} stars`)),
        cur ? h('span.chip', 'You') : null,
      );
    }),
  );
}

/**
 * Rank-up celebration: the old emblem flies up and fades, light rays spin up,
 * the new emblem lands with a flash, the name types in and the rank stars
 * light one by one. Tap or press any key to continue. Reduce motion: a still card.
 */
export function rankUpShow(host, rank, { onDone, sound } = {}) {
  const from = rank.from;
  const newTier = !from || from.tier !== rank.tier;
  const oldEm = from ? h('div.ru-old', { innerHTML: emblemSVG(from, 120) }) : null;
  const newEm = h('div.ru-new', { innerHTML: emblemSVG(rank, 150) });
  const stars = rankStars({ ...rank, filled: 0 });
  const ov = h(
    'div.rank-up-ov',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Rank up: ${rank.name}`, 'data-testid': 'rank-up-ov', style: { '--tier': rank.color } },
    h('div.ru-rays', { 'aria-hidden': 'true' }),
    h('div.ru-burst', { 'aria-hidden': 'true' }),
    h('div.ru-stage', oldEm, newEm),
    h('div.ru-label', newTier ? 'New rank!' : 'Division up!'),
    h('div.ru-name', rank.name),
    from ? h('div.ru-from', `from ${from.name}`) : null,
    stars,
    h('button.btn.ru-btn', { 'data-testid': 'rank-up-skip', 'aria-label': 'Skip rank-up animation' }, 'Skip'),
  );
  host.appendChild(ov);
  const calm = document.body.classList.contains('reduce-motion');
  if (calm) ov.classList.add('calm');
  const timers = [];
  const at = (ms, f) => timers.push(setTimeout(f, calm ? 0 : ms));
  at(50, () => ov.classList.add('s1')); // old emblem rises
  at(700, () => (ov.classList.add('s2'), sound?.(0))); // flash + new emblem
  const lit = [...stars.children].slice(0, rank.filled);
  lit.forEach((s, i) => at(1300 + i * 220, () => (s.classList.add('on', 'pop'), sound?.(i + 1))));
  at(1300 + lit.length * 220 + 200, () => {
    ov.classList.add('s3');
    const btn = ov.querySelector('.ru-btn');
    btn.textContent = 'Continue ▸';
    btn.classList.add('primary');
    btn.setAttribute('aria-label', 'Continue');
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', close);
    ov.classList.add('out');
    setTimeout(() => (ov.remove(), onDone?.()), calm ? 0 : 280);
  };
  // Skip works at once; tapping elsewhere or Continue closes once the show has started
  ov.querySelector('.ru-btn').addEventListener('click', (e) => (e.stopPropagation(), close()));
  setTimeout(() => {
    ov.addEventListener('click', close);
    window.addEventListener('keydown', close);
  }, calm ? 0 : 600);
  return { close };
}
