/** Badges & rockets: earned badges, and rocket colours unlocked with stars. */
import { h, fitCanvas } from '../dom.js';
import { progress, BADGES, SKINS } from '../../game/progress.js';
import { createRenderer } from '../../arcade/draw.js';
import { sfx } from '../audio.js';
import { vyomNote } from '../guide.js';
import { LEVELS } from '../../arcade/levels.js';
import { briefFor } from '../debrief.js';

export function hangarScreen(app) {
  const prog = progress(app);
  const total = prog.total();
  const r = createRenderer();
  const previews = [];
  const skinCard = (k) => {
    const open = prog.skinOpen(k);
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
      h('div.small.muted', open ? (prog.data.skin === k.id ? 'Flying this one' : 'Tap to choose') : k.cards ? `Locked: ${k.cards} history cards needed` : k.quiz ? `Locked: ${k.quiz === 3 ? 'Quiz to Orbit with 3 ★' : 'reach orbit in Quiz to Orbit'}` : `Locked: ${k.need} ★ needed`),
    );
  };
  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', 'Badges & rockets')),
    vyomNote(total ? 'Collect stars to unlock new rocket colours. Tap one to fly it!' : 'Win levels to earn stars, badges and new rocket colours!', 'happy'),
    h('p.muted', `You have ★ ${total} stars and ${Object.keys(prog.data.badges).length} of ${BADGES.length} badges. Quiz: ${prog.data.quizRight} answered right.`),
    h('div.section', h('h3', 'Badges')),
    h(
      'div.badge-grid',
      BADGES.map((b) => {
        const got = !!prog.data.badges[b.id];
        return h('div.badge' + (got ? '.got' : ''), h('div.medal' + (got ? '' : '.off'), '★'), h('div.b', b.name), h('div.small.muted', b.desc));
      }),
    ),
    h('div.section', h('h3', 'Rocket colours')),
    h('div.skin-grid', SKINS.map(skinCard)),
    h('div.section', h('h3', 'Mission history cards'), h('span.small.muted', `${prog.cardCount()} of ${LEVELS.length} unlocked`)),
    h('p.small.muted', 'Answer a mission’s quiz question right (after its level, or in Quiz to Orbit) to unlock its card.'),
    h(
      'div.card-grid',
      LEVELS.map((L) => {
        const got = prog.card(L.id);
        return h(
          'details.hcard' + (got ? '.got' : ''),
          { 'data-testid': 'hcard-' + L.id },
          h('summary', h('span.hc-year', String(L.year)), h('span.hc-name', L.title), h('span.small.muted', got ? L.mission : `${L.mission} · locked`)),
          h('p.small', got ? briefFor(L.id)?.history || L.fact : 'Answer this mission’s quiz question right to read it.'),
        );
      }),
    ),
  );
  return {
    el,
    tour: [
      { sel: '.badge-grid', title: 'Badges', text: 'Badges are earned for special feats: first win, soft landings, streaks and more.' },
      { sel: '.skin-grid', title: 'Rocket colours', text: 'Stars unlock new rocket colours. Tap an unlocked one to fly it.' },
      { sel: '.card-grid', title: 'History cards', text: 'Answer a mission’s quiz question right to unlock its real history card.' },
    ],
    mounted() {
      for (const [c, k] of previews) {
        const { w, h: H, ctx } = fitCanvas(c);
        r.rocket(ctx, w / 2, H / 2, -Math.PI / 4, k, true, Math.min(w, H) * 0.28);
      }
    },
  };
}
