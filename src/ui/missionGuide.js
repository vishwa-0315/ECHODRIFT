/** Full step-by-step guide for an Expert mission, shown as an overlay (from the briefing or mid-flight). */
import { h } from './dom.js';
import { vyomNote } from './guide.js';
import guides from '../../content/guides.json';

export function hasGuide(id) {
  return !!guides.missions[id];
}

export function openGuide(app, id, { onClose } = {}) {
  const g = guides.missions[id];
  const m = app.content.missions.find((x) => x.id === id);
  if (!g) return;
  const controls = guides.controls[g.kind] || [];
  const ctrlBox = h('div.guide-controls', { style: { display: 'none' } }, controls.map((c) => h('div.guide-step', h('div.b', c.title), h('div.small', c.text))));
  const ctrlBtn = h('button.btn.sm', { 'data-testid': 'guide-controls', onclick: () => ((ctrlBox.style.display = ctrlBox.style.display === 'none' ? '' : 'none'), (ctrlBtn.textContent = ctrlBox.style.display === 'none' ? 'Show the controls' : 'Hide the controls')) }, 'Show the controls');
  const close = () => {
    ov.remove();
    onClose?.();
  };
  const ov = h(
    'div.overlay.guide-overlay',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Guide: ${m.title}` },
    h(
      'div.modal.guide-modal',
      h('div.row', h('div.label.grow', 'Full mission guide'), h('button.btn.icon.sm.ghost', { 'aria-label': 'Close guide', onclick: close, 'data-testid': 'guide-close' }, '←')),
      h('h2', m.title),
      vyomNote(g.summary, 'happy'),
      h('div.guide-steps', g.steps.map((s) => h('div.guide-step', h('div.b', s.title), h('div', s.text)))),
      g.tips?.length ? h('div.fact', h('b', 'Tips: '), g.tips.join(' ')) : null,
      h('div.row.wrap', { style: { marginTop: '10px' } }, ctrlBtn),
      ctrlBox,
      h('div.row', { style: { marginTop: '12px' } }, h('div.spacer'), h('button.btn.primary', { onclick: close }, 'Got it')),
    ),
  );
  app.root.querySelectorAll('.toast').forEach((t) => t.remove());
  app.root.appendChild(ov);
  return ov;
}
