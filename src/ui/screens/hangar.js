/** Badges & rockets: earned badges, and rocket colours unlocked with stars. */
import { h, fitCanvas } from '../dom.js';
import { progress, BADGES, SKINS } from '../../game/progress.js';
import { createRenderer } from '../../arcade/draw.js';
import { sfx } from '../audio.js';

export function hangarScreen(app) {
  const prog = progress(app);
  const total = prog.total();
  const r = createRenderer();
  const previews = [];
  const skinCard = (k) => {
    const open = total >= k.need;
    const c = h('canvas.skin-prev', { 'aria-hidden': 'true' });
    previews.push([c, k]);
    return h(
      'button.skin' + (prog.data.skin === k.id ? '.on' : '') + (open ? '' : '.locked'),
      {
        disabled: !open,
        'data-testid': 'skin-' + k.id,
        onclick: () => {
          prog.setSkin(k.id);
          sfx.unlock();
          app.go('hangar');
        },
      },
      c,
      h('div.b', k.name),
      h('div.small.muted', open ? (prog.data.skin === k.id ? 'Flying this one' : 'Tap to choose') : `🔒 ${k.need} ★ needed`),
    );
  };
  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', 'Badges & rockets')),
    h('p.muted', `You have ★ ${total} stars and ${Object.keys(prog.data.badges).length} of ${BADGES.length} badges. Quiz: ${prog.data.quizRight} answered right.`),
    h('div.section', h('h3', 'Badges')),
    h(
      'div.badge-grid',
      BADGES.map((b) => {
        const got = !!prog.data.badges[b.id];
        return h('div.badge' + (got ? '.got' : ''), h('div.ic', got ? b.icon : '🔒'), h('div.b', b.name), h('div.small.muted', b.desc));
      }),
    ),
    h('div.section', h('h3', 'Rocket colours')),
    h('div.skin-grid', SKINS.map(skinCard)),
  );
  return {
    el,
    mounted() {
      for (const [c, k] of previews) {
        const { w, h: H, ctx } = fitCanvas(c);
        r.rocket(ctx, w / 2, H / 2, -Math.PI / 4, k, true, Math.min(w, H) * 0.28);
      }
    },
  };
}
