import { h } from '../dom.js';
import { t, L } from '../i18n.js';
import { moonPhase } from '../../core/sky.js';

/** Home / Galaxy Map: worlds as glowing nodes + Look Up Tonight card. */
export function mapScreen(app) {
  const c = app.content;
  const map = h('div.map', { role: 'list', 'aria-label': t('map.label') });
  // Connecting route line (SVG)
  const pts = c.worlds.map((w) => `${w.map.x * 100},${w.map.y * 100}`).join(' ');
  map.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="rgba(160,170,255,.25)" stroke-width=".5" stroke-dasharray="1.5 1.5"/></svg>`;
  const firstOpen = c.worlds.find((w) => app.ws(w.id).unlocked && !app.ws(w.id).complete);
  for (const w of c.worlds) {
    const ws = app.ws(w.id);
    const soon = w.status !== 'playable';
    const locked = soon || !ws.unlocked;
    const levels = w.levels || [];
    const stars = levels.reduce((s, id) => s + (ws.levelStars[id] || 0), 0);
    const node = h(
      'button.node' + (locked ? '.locked' : '') + (firstOpen === w ? '.current' : ''),
      {
        role: 'listitem',
        style: { left: w.map.x * 100 + '%', top: w.map.y * 100 + '%', color: w.color },
        'aria-label': `${L(w, 'name')}: ${soon ? t('map.soon') : locked ? t('map.locked') : ws.complete ? t('map.complete') : t('map.open')}`,
        'data-testid': 'world-' + w.id,
        onclick: () => openWorld(w),
      },
      h('div.orb', { style: { background: `radial-gradient(circle at 35% 35%, #fff8, ${w.color} 45%, #0008)` } }),
      h('div.lbl', L(w, 'name')),
      soon ? h('div.st', { 'aria-hidden': 'true' }, '🔒') : locked ? h('div.st', '🔒') : h('div.st', { 'aria-hidden': 'true' }, levels.length ? `★ ${stars}/${levels.length * 3}` : '', ws.complete ? ' ✓' : ''),
    );
    map.appendChild(node);
  }

  async function openWorld(w) {
    app.sfx('click');
    const ws = app.ws(w.id);
    if (w.status !== 'playable') {
      await app.modal(h('div', h('div.kicker', t('map.soon')), h('h2', L(w, 'name')), h('p', L(w, 'teaser')), h('p.small.muted', L(w.objectives[0], 'text'))));
      return;
    }
    if (!ws.unlocked) {
      app.toast(t('map.lockedHint'));
      return;
    }
    if (ws.complete) {
      const v = await app.modal(h('div', h('h2', L(w, 'name')), h('p', t('map.replayQ'))), [
        { label: t('ui.cancel'), value: null },
        { label: t('map.replayFlights'), value: 'fly', cls: 'primary' },
        { label: t('map.replayAll'), value: 'all' },
      ]);
      if (!v) return;
      if (v === 'fly') return app.go('flight', { world: w.id, replay: true });
      ws.phase = 'intro';
      ws.levelIndex = 0;
      app.persist();
    }
    app.resumeWorld(w.id);
  }

  // Look Up Tonight (computed offline from the device date)
  const now = new Date();
  const mp = moonPhase(now);
  const sky = c.extras.sky;
  const tonight = h(
    'div.card',
    { style: { marginTop: '10px' } },
    h('div.row', h('div', { style: { fontSize: '2rem' }, 'aria-hidden': 'true' }, moonEmoji(mp.name)), h('div.grow', h('div.kicker', t('sky.title')), h('div', h('b', t('moon.' + mp.name)), ` · ${Math.round(mp.illum * 100)}% ${t('sky.lit')}`))),
    h('p.small', { style: { margin: '8px 0 4px' } }, L({ id: 'sky-phase-' + mp.name, t: sky.byPhase[mp.name] }, 't')),
    h('p.small.muted', { style: { margin: 0 } }, L({ id: 'sky-month-' + (now.getMonth() + 1), t: sky.byMonth[String(now.getMonth() + 1)] }, 't')),
  );

  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': t('ui.back'), onclick: () => app.go('title') }, '←'), h('h2', t('map.title')), h('span.chip', { 'aria-label': t('map.totalStars') }, '★ ' + app.totalStars())),
    map,
    tonight,
    h(
      'div.grid2',
      { style: { marginTop: '10px' } },
      h('button.btn', { onclick: () => app.go('logbook') }, '📖 ', t('nav.logbook')),
      h('button.btn', { onclick: () => app.go('settings') }, '⚙ ', t('nav.settings')),
      h('button.btn', { onclick: () => (app.save.sandboxUnlocked ? app.go('sandbox') : app.toast(t('sandbox.locked'))), 'aria-disabled': !app.save.sandboxUnlocked }, app.save.sandboxUnlocked ? '🪐 ' : '🔒 ', t('nav.sandbox')),
      h('button.btn', { onclick: () => app.go('parent') }, '👪 ', t('nav.parent')),
    ),
  );
  return { el };
}

function moonEmoji(n) {
  return { new: '🌑', waxingCrescent: '🌒', firstQuarter: '🌓', waxingGibbous: '🌔', full: '🌕', waningGibbous: '🌖', lastQuarter: '🌗', waningCrescent: '🌘' }[n];
}
