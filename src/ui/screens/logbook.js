/** Logbook: Orrin fragments, science facts (with sources), clue archive, Real Space gallery, badges. */
import { h, clear, put } from '../dom.js';
import { t, L } from '../i18n.js';
import { topbar } from './common.js';

export function logbookScreen(app) {
  const lb = app.save.logbook;
  const c = app.content;
  const body = h('div.list');
  let tab = 'fragments';
  const tabs = ['fragments', 'facts', 'clues', 'gallery', 'badges'];
  const tabBar = h('div.tabs', { role: 'tablist' });

  function draw() {
    put(clear(tabBar), ...tabs.map((k) => h('button.btn' + (tab === k ? '.on' : ''), { role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', onclick: () => ((tab = k), app.sfx('click'), draw()) }, t('log.' + k))));
    clear(body);
    if (tab === 'fragments') {
      const all = Object.keys(c.dialogue.fragments);
      all.forEach((id, i) =>
        body.appendChild(h('div.card', h('div.kicker', t('log.fragmentN', { n: i + 1 })), lb.fragments.includes(id) ? h('p', { style: { fontSize: '1.1rem', margin: 0 } }, '“' + L({ id, t: c.dialogue.fragments[id] }, 't') + '”') : h('p.muted', { style: { margin: 0 } }, t('log.fragmentLocked')))),
      );
      for (let i = all.length; i < 8; i++) body.appendChild(h('div.card', h('div.kicker', t('log.fragmentN', { n: i + 1 })), h('p.muted', { style: { margin: 0 } }, t('map.soon'))));
    } else if (tab === 'facts') {
      const got = c.science.facts.filter((f) => lb.facts.includes(f.id));
      if (!got.length) body.appendChild(empty(t('log.noFacts')));
      for (const f of got)
        body.appendChild(
          h(
            'details.card',
            h('summary', { style: { cursor: 'pointer', minHeight: '32px', fontWeight: 700 } }, L(f, 'title')),
            h('p', { style: { marginTop: '8px' } }, L(f, 'text')),
            h('p.small.muted', h('b', t('log.simplified')), ' ', L(f, 'simplification')),
            h('p.small.muted', t('log.source'), ' ', f.source.title, app.settings.track === 'commander' ? '' : ''),
            h('button.btn.small', { onclick: () => openSource(f.source) }, '🔗 ', t('log.openSource')),
          ),
        );
      body.appendChild(h('p.small.muted.center', t('log.factCount', { n: got.length, m: c.science.facts.length })));
    } else if (tab === 'clues') {
      const all = Object.values(c.investigations).flatMap((inv) => inv.clues.map((cl) => ({ ...cl, world: inv.world })));
      const got = all.filter((cl) => lb.clues.includes(cl.id));
      if (!got.length) body.appendChild(empty(t('log.noClues')));
      for (const cl of got) body.appendChild(h('div.card.clue', h('div.kicker', L(app.worldDef(cl.world), 'name')), h('h4', { style: { margin: '2px 0' } }, L(cl, 'title')), h('div.data', L(cl, 'data')), cl.redHerring ? h('div.small', { style: { color: 'var(--amber)' } }, '🐟 ', t('log.redHerring')) : null));
    } else if (tab === 'gallery') {
      for (const g of c.extras.gallery) {
        const open = lb.gallery.includes(g.id);
        body.appendChild(
          h(
            'div.card',
            h('div.gal', { style: { background: open ? `linear-gradient(135deg, ${g.palette.join(', ')})` : '#15132e' }, role: 'img', 'aria-label': open ? L(g, 'title') : t('log.galleryLocked') }, open ? L(g, 'title') : '🔒'),
            open ? h('p.small', { style: { margin: '8px 0 0' } }, L(g, 'caption')) : h('p.small.muted', { style: { margin: '8px 0 0' } }, t('log.galleryHint', { w: L(app.worldDef(g.unlockedBy), 'name') })),
            open ? h('p.small.muted', { style: { margin: '4px 0 0' } }, t('log.placeholder')) : null,
          ),
        );
      }
    } else if (tab === 'badges') {
      for (const [id, b] of Object.entries(c.extras.badges)) {
        const got = lb.badges.includes(id);
        body.appendChild(h('div.card.row', h('div', { style: { fontSize: '2rem', opacity: got ? 1 : 0.3 }, 'aria-hidden': 'true' }, '🏅'), h('div', h('b', L({ ...b, id: 'badge-' + id }, 'name')), h('div.small.muted', L({ ...b, id: 'badge-' + id }, 'desc')), h('div.small', got ? '✓ ' + t('log.earned') : t('log.notYet')))));
      }
    }
  }
  const empty = (msg) => h('div.card.center', h('div', { style: { fontSize: '2rem' }, 'aria-hidden': 'true' }, '🔭'), h('p.muted', { style: { margin: 0 } }, msg));

  /** External links sit behind the parental gate (child-safety rule). */
  async function openSource(src) {
    const ok = await parentalGate(app);
    if (ok) window.open(src.url, '_blank', 'noopener');
  }

  draw();
  return { el: h('div.screen', topbar(app, t('nav.logbook')), tabBar, h('div', { style: { height: '8px' } }), body) };
}

/** Parental gate: type a number written in words, as digits. Resolves true/false. */
export async function parentalGate(app) {
  const words = [
    [47, 'forty-seven'],
    [83, 'eighty-three'],
    [29, 'twenty-nine'],
    [64, 'sixty-four'],
    [91, 'ninety-one'],
    [38, 'thirty-eight'],
  ];
  const [n, w] = words[Math.floor(Math.random() * words.length)];
  const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': t('gate.input'), style: { width: '100%', minHeight: '48px', fontSize: '1.4rem', padding: '8px 12px', borderRadius: '12px', border: '1px solid var(--line)', background: '#0b0a20' }, 'data-testid': 'gate-input' });
  const v = await app.modal(h('div', h('h2', '👪 ' + t('gate.title')), h('p', t('gate.prompt', { w: t('num.' + n) || w })), input), [
    { label: t('ui.cancel'), value: false },
    { label: t('ui.ok'), cls: 'primary', value: true },
  ]);
  if (!v) return false;
  if (input.value.trim() === String(n)) return true;
  app.toast(t('gate.wrong'));
  return false;
}
