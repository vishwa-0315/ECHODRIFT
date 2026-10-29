/** Caution card before a reset: shows exactly what will be lost; Reset stays locked until the player ticks "I understand". */
import { h } from './dom.js';
import { progress, BADGES, CERTS } from '../game/progress.js';
import { LEVELS } from '../arcade/levels.js';
import { sfx } from './audio.js';

const WARN = '<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><path d="M28 5 L53 49 H3 Z" fill="#ffb020" stroke="#1a0d00" stroke-width="3" stroke-linejoin="round"/><rect x="25.5" y="19" width="5" height="17" rx="2.5" fill="#1a0d00"/><circle cx="28" cy="42" r="3" fill="#1a0d00"/></svg>';

export function cautionReset(app, onConfirm) {
  const prog = progress(app);
  const rank = prog.rank();
  const lost = [
    [`${prog.total()} of ${LEVELS.length * 3}`, 'mission stars'],
    [rank.name, 'pilot rank (back to Bronze I)'],
    [`${Object.keys(prog.data.badges).length} of ${BADGES.length}`, 'badges'],
    [`${CERTS.filter((c) => prog.certEarned(c.id)).length} of ${CERTS.length}`, 'certificates'],
    [`${prog.cardCount()}`, 'history cards'],
    [`${prog.expertDone()}`, 'Expert missions'],
    [`${prog.dailyStreak()} day`, 'daily streak'],
  ];
  const tick = h('input', { type: 'checkbox', 'data-testid': 'caution-tick' });
  const del = h('button.btn.danger-solid', { 'data-testid': 'caution-reset', disabled: true }, 'Delete everything');
  const keep = h('button.btn.primary.grow', { 'data-testid': 'caution-keep' }, 'Keep my progress');
  tick.onchange = () => (del.disabled = !tick.checked);
  const close = () => (ov.remove(), window.removeEventListener('keydown', esc));
  const esc = (e) => e.key === 'Escape' && close();
  const ov = h(
    'div.overlay.caution-ov',
    { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'caution-title', onclick: (e) => e.target === ov && close() },
    h(
      'div.modal.caution-card',
      h('div.caution-head', h('span', { innerHTML: WARN }), h('div', h('div.caution-label', 'Caution'), h('h2#caution-title', 'Reset all progress?'))),
      h('p', 'This permanently deletes everything below from this device. It cannot be undone, and certificates already issued can no longer be verified as yours.'),
      h('ul.caution-list', lost.map(([v, k]) => h('li', h('b', v), h('span', k)))),
      h('p.small.muted', 'Your profile details (name, school, city) and settings are kept.'),
      h('label.caution-tick', tick, h('span', 'I understand that this cannot be undone.')),
      h('div.row.wrap.result-btns', del, keep),
    ),
  );
  keep.onclick = () => (sfx.tap(), close());
  del.onclick = () => {
    if (!tick.checked) return;
    close();
    onConfirm();
  };
  window.addEventListener('keydown', esc);
  app.root.appendChild(ov);
  keep.focus();
}
