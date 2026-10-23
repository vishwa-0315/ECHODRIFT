/** Parent/Teacher screen (behind the parental gate). All data stays on this device. */
import { h, clear, put } from '../dom.js';
import { t, L } from '../i18n.js';
import { masteredConcepts } from '../../core/save.js';
import { topbar } from './common.js';
import { parentalGate } from './logbook.js';

export function parentScreen(app) {
  const root = h('div.screen');
  const fmtTime = (s) => (s < 3600 ? t('par.mins', { n: Math.round(s / 60) }) : t('par.hours', { n: (s / 3600).toFixed(1) }));

  function locked() {
    put(clear(root), 
      topbar(app, t('nav.parent')),
      h('div.card.center', h('div', { style: { fontSize: '2.4rem' }, 'aria-hidden': 'true' }, '👪'), h('p', t('par.gateIntro'))),
      h('div.spacer'),
      h('button.btn.primary.block', { 'data-testid': 'gate-open', onclick: async () => ((await parentalGate(app)) ? report() : null) }, t('par.unlock')),
    );
  }

  function report() {
    const c = app.content;
    const mastered = new Set(masteredConcepts(app.save));
    const allObjectives = c.worlds.filter((w) => w.status === 'playable').flatMap((w) => w.objectives.map((o) => ({ ...o, world: w })));
    const evidenceFor = (id) => app.save.evidence.filter((e) => e.concept === id);
    put(clear(root), 
      topbar(app, t('par.title'), { extra: h('button.btn.no-print', { onclick: () => window.print() }, '🖨 ', t('par.print')) }),
      h('p.small.muted', t('par.privacy')),
      h('div.grid2', h('div.card', h('div.kicker', t('par.time')), h('h2', fmtTime(app.save.timePlayed.total))), h('div.card', h('div.kicker', t('par.mastered')), h('h2', `${allObjectives.filter((o) => mastered.has(o.id)).length}/${allObjectives.length}`))),
      h('h3', { style: { marginTop: '14px' } }, t('par.worlds')),
      h(
        'div.list',
        c.worlds
          .filter((w) => w.status === 'playable')
          .map((w) => {
            const ws = app.ws(w.id);
            const stars = (w.levels || []).reduce((s, id) => s + (ws.levelStars[id] || 0), 0);
            return h(
              'div.card',
              h('div.row', h('b.grow', L(w, 'name')), h('span.chip', ws.complete ? '✓ ' + t('par.done') : ws.unlocked ? t('phase.' + phaseKey(ws.phase)) : '🔒')),
              h('div.small.muted', `★ ${stars}/${(w.levels || []).length * 3} · ${t('par.quiz')}: ${ws.quizScore ?? '–'}/3 · ${t('par.case')}: ${ws.hypothesis ? t('par.hyp.' + ws.hypothesis) : '–'} · ${fmtTime(app.save.timePlayed.perWorld[w.id] || 0)}`),
            );
          }),
      ),
      h('h3', { style: { marginTop: '14px' } }, t('par.concepts')),
      h(
        'div.list',
        allObjectives.map((o) => {
          const ev = evidenceFor(o.id);
          const m = mastered.has(o.id);
          return h(
            'div.card',
            h('div.row', h('span', { 'aria-hidden': 'true' }, m ? '✅' : ev.length ? '🟡' : '⚪'), h('b.grow', L(o, 'text')), h('span.chip', m ? t('par.m') : ev.length ? t('par.p') : t('par.n'))),
            h('div.small.muted', `${L(o.world, 'name')} · ${o.tags.join(', ')}${o.chapter ? ' · ' + o.chapter : ''}`),
            ev.length ? h('div.small', { style: { marginTop: '4px' } }, t('par.evidence'), ' ', [...new Set(ev.map((e) => t('par.src.' + e.source.split(':')[0])))].join(', ')) : null,
          );
        }),
      ),
      h('h3', { style: { marginTop: '14px' } }, t('par.settings')),
      h(
        'div.setting',
        h('span', t('par.nudge')),
        h(
          'div.seg',
          [0, 20, 30, 45].map((n) => h('button', { 'aria-pressed': app.settings.sessionNudgeMin === n ? 'true' : 'false', onclick: () => (app.setSetting('sessionNudgeMin', n), report()) }, n ? n + 'm' : t('par.off'))),
        ),
      ),
      h('p.small.muted', { style: { marginTop: '12px' } }, t('par.noData')),
    );
  }
  const phaseKey = (p) => ({ intro: 'fly', fly: 'fly', investigate: 'investigate', build: 'build', report: 'report', forge: 'forge', debrief: 'forge', done: 'forge' })[p];

  locked();
  return { el: root };
}
