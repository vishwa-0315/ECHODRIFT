import { h } from '../dom.js';
import { t } from '../i18n.js';

/** Standard top bar: back button, title, optional "?" tutorial replay + extras. */
export function topbar(app, title, { back = 'map', backParams = {}, onHelp, extra } = {}) {
  return h(
    'div.topbar',
    back ? h('button.btn.icon.ghost', { 'aria-label': t('ui.back'), onclick: () => (app.sfx('click'), typeof back === 'function' ? back() : app.go(back, backParams)) }, '←') : null,
    h('h2', title),
    extra || null,
    onHelp ? h('button.btn.icon', { 'aria-label': t('ui.help'), onclick: () => (app.sfx('click'), onHelp()) }, '?') : null,
  );
}

export function starsText(n, max = 3) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}

/** Small step indicator FLY › INVESTIGATE › … for the world loop. */
export function phaseSteps(current) {
  const steps = ['fly', 'investigate', 'build', 'report', 'forge'];
  return h(
    'div.row',
    { style: { gap: '4px', justifyContent: 'center', margin: '0 0 8px' }, 'aria-label': t('ui.progress') },
    steps.map((s) => h('span.chip', { style: { opacity: s === current ? 1 : 0.45, borderColor: s === current ? 'var(--teal)' : '' }, 'aria-current': s === current ? 'step' : null }, t('phase.' + s))),
  );
}
