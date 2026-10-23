import { h } from '../dom.js';
import { t, L } from '../i18n.js';
import { topbar } from './common.js';

/** World Intro: short story card, then crew dialogue, then FLY. */
export function introScreen(app, { world }) {
  const w = app.worldDef(world);
  const go = async () => {
    app.sfx('ping');
    await app.dialogue(app.content.dialogue.worlds[world].intro);
    app.advance(world, 'intro');
    app.go('flight', { world });
  };
  const el = h(
    'div.screen',
    topbar(app, L(w, 'name')),
    h(
      'div.card.glow',
      { style: { textAlign: 'center', padding: '24px 16px' } },
      h('div', { style: { width: '120px', height: '120px', margin: '0 auto 16px', borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, #fff9, ${w.color} 45%, #000a)`, boxShadow: `0 0 50px ${w.color}` }, 'aria-hidden': 'true' }),
      h('div.kicker', t('intro.world', { n: w.order })),
      h('h1', L(w, 'name')),
      h('p', L(w, 'tagline')),
      h('p.small.muted', t('intro.distance', { ly: w.distanceLy })),
    ),
    h('div.spacer'),
    h('button.btn.primary.block', { onclick: go, 'data-testid': 'intro-go', style: { marginTop: '16px' } }, t('intro.go')),
  );
  return { el, worldId: world };
}
