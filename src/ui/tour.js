/**
 * Page tours: a short spotlight walk-through the first time a player opens a
 * page. Every step has Back / Next and a Skip button. Seen tours are stored
 * in settings.tours, and Settings can show them all again.
 */
import { h } from './dom.js';
import { vyomSVG, speak } from './guide.js';

/** Automatic help (tours, demos) is off for automated test browsers unless forced. */
export const autoHelp = (app) => app.settings.autoHelp !== false && (!navigator.webdriver || window.__lwForceHelp === true);

export const tourSeen = (app, key) => !!(app.settings.tours || {})[key];
export function markTour(app, key) {
  app.setSetting('tours', { ...(app.settings.tours || {}), [key]: true });
}

/**
 * steps: [{ sel?, title, text }]. A step without sel (or whose element is
 * missing) is shown in the middle of the screen.
 */
export function runTour(app, key, steps, { force = false, onDone } = {}) {
  if (!steps?.length) return;
  if (!force && (tourSeen(app, key) || !autoHelp(app))) return;
  const root = app.root;
  root.querySelector('.tour')?.remove();
  let i = 0;
  const ring = h('div.tour-ring', { 'aria-hidden': 'true' });
  const count = h('div.tour-count.small.muted');
  const title = h('b.tour-title');
  const text = h('p.tour-text');
  const back = h('button.btn.sm', { 'data-testid': 'tour-back', onclick: () => show(i - 1) }, 'Back');
  const next = h('button.btn.sm.primary', { 'data-testid': 'tour-next', onclick: () => (i < steps.length - 1 ? show(i + 1) : done()) }, 'Next');
  const skip = h('button.btn.sm.ghost', { 'data-testid': 'tour-skip', onclick: () => done() }, 'Skip tour');
  const face = h('span.tour-vyom', { innerHTML: vyomSVG('happy', 40) });
  const bubble = h('div.tour-bubble', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Page tour' }, h('div.tour-head', face, h('div.grow', count, title)), text, h('div.tour-btns', skip, h('div.grow'), back, next));
  const wrap = h('div.tour', { onclick: (e) => e.target === wrap && next.click() }, ring, bubble);
  root.appendChild(wrap);
  const keyH = (e) => {
    if (e.key === 'Escape') done();
    else if (e.key === 'ArrowRight') next.click();
    else if (e.key === 'ArrowLeft' && i > 0) back.click();
  };
  window.addEventListener('keydown', keyH);

  function place() {
    const st = steps[i];
    const t = st.sel ? root.querySelector(st.sel) : null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const bw = Math.min(360, vw - 24);
    bubble.style.width = bw + 'px';
    if (!t || !t.getClientRects().length) {
      ring.style.display = 'none';
      wrap.classList.add('dim');
      bubble.style.left = (vw - bw) / 2 + 'px';
      bubble.style.top = Math.max(12, vh / 2 - bubble.offsetHeight / 2) + 'px';
      return;
    }
    wrap.classList.remove('dim');
    const r = t.getBoundingClientRect();
    const pad = 6;
    Object.assign(ring.style, { display: '', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const below = r.bottom + 14 + bubble.offsetHeight < vh;
    bubble.style.left = Math.max(12, Math.min(vw - bw - 12, r.left + r.width / 2 - bw / 2)) + 'px';
    bubble.style.top = (below ? r.bottom + 14 : Math.max(12, r.top - 14 - bubble.offsetHeight)) + 'px';
  }
  function show(k) {
    i = Math.max(0, Math.min(steps.length - 1, k));
    const st = steps[i];
    count.textContent = `Tour ${i + 1} of ${steps.length}`;
    title.textContent = st.title;
    text.textContent = st.text;
    back.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? 'Got it' : 'Next';
    const t = st.sel ? root.querySelector(st.sel) : null;
    if (t) t.scrollIntoView({ block: 'center', behavior: 'instant' });
    requestAnimationFrame(place);
    speak(st.title + '. ' + st.text);
    next.focus();
  }
  function done() {
    window.removeEventListener('keydown', keyH);
    window.removeEventListener('resize', place);
    wrap.remove();
    markTour(app, key);
    onDone?.();
  }
  window.addEventListener('resize', place);
  show(0);
  return { done };
}
