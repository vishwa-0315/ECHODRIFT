/** Mission Debrief: optional 3-question quiz as crew banter, then world complete. */
import { h, clear, put } from '../dom.js';
import { t, L } from '../i18n.js';
import { portrait } from '../art.js';
import { scoreQuiz } from '../../core/save.js';
import { topbar, starsText } from './common.js';

export function debriefScreen(app, { world }) {
  const quiz = app.content.quizzes[world];
  const ws = app.ws(world);
  const root = h('div.screen');
  const answers = {};
  let i = 0;

  function intro() {
    put(clear(root), 
      topbar(app, t('deb.title'), { back: null }),
      h('div.card.glow', { style: { textAlign: 'center' } }, h('div', { style: { fontSize: '3rem' }, 'aria-hidden': 'true' }, '🎉'), h('h2', t('deb.worldDone', { w: L(app.worldDef(world), 'name') })), h('p', t('deb.offer'))),
      h('div.spacer'),
      h('button.btn.primary.block', { onclick: () => question(), 'data-testid': 'quiz-start' }, t('deb.start')),
      h('button.btn.ghost.block', { style: { marginTop: '8px' }, onclick: () => complete(true), 'data-testid': 'quiz-skip' }, t('deb.skip')),
    );
  }

  function question() {
    const q = quiz.questions[i];
    const sp = app.content.dialogue.speakers[q.speaker];
    put(clear(root), 
      topbar(app, t('deb.title'), { back: null }),
      h('div.small.muted.center', t('deb.q', { n: i + 1, m: quiz.questions.length })),
      h('div.row', { style: { alignItems: 'flex-start', margin: '10px 0' } }, h('div.portrait', { style: { color: sp.color }, html: portrait(q.speaker, 'thinking', sp.color) }), h('div.bubble', h('div.who', { style: { color: sp.color } }, L({ ...sp, id: 'speaker-' + q.speaker }, 'name')), h('div.txt', L(q, 'q', `${world}-${q.id}-q`)))),
      h(
        'div.list',
        q.options.map((o, k) => h('button.btn.block', { style: { justifyContent: 'flex-start', textAlign: 'left' }, 'data-opt': k, onclick: () => answer(k) }, L({ id: `${world}-${q.id}-o${k}`, t: o }, 't'))),
      ),
    );
  }

  async function answer(k) {
    const q = quiz.questions[i];
    answers[q.id] = k;
    const right = k === q.correct;
    app.sfx(right ? 'star' : 'boing');
    if (right) app.evidence([q.concept], `quiz:${world}:${q.id}`);
    await app.modal(
      h('div', h('h2', right ? t('deb.right') : t('deb.wrong')), !right ? h('p.small.muted', t('deb.answerWas', { a: L({ id: `${world}-${q.id}-o${q.correct}`, t: q.options[q.correct] }, 't') })) : null, h('p', L(q, 'feedback', `${world}-${q.id}-fb`))),
      [{ label: t('ui.next'), cls: 'primary', value: 1 }],
    );
    i++;
    if (i < quiz.questions.length) question();
    else complete(false);
  }

  function complete(skipped) {
    const score = skipped ? null : scoreQuiz(quiz, answers);
    ws.quizScore = score ? score.correct : ws.quizScore;
    app.advance(world, 'debrief');
    const wdef = app.worldDef(world);
    const stars = (wdef.levels || []).reduce((s, id) => s + (ws.levelStars[id] || 0), 0);
    if ((wdef.levels || []).every((id) => ws.levelStars[id] === 3)) app.badge('allStars');
    app.persist();
    const next = app.content.worlds.find((w) => w.order === wdef.order + 1);
    put(clear(root), 
      topbar(app, t('deb.complete'), { back: null }),
      h(
        'div.card.glow',
        { style: { textAlign: 'center' } },
        h('h2', L(wdef, 'name') + ' ✓'),
        h('div.stars', { style: { fontSize: '1.6rem' } }, starsText(stars, (wdef.levels || []).length * 3)),
        score ? h('p', t('deb.score', { n: score.correct, m: score.total })) : null,
        h('p.small.muted', t('deb.logbookHint')),
      ),
      next ? h('div.card', { style: { marginTop: '10px' } }, h('div.kicker', next.status === 'playable' ? t('deb.unlocked') : t('map.soon')), h('b', L(next, 'name')), h('p.small', { style: { margin: '4px 0 0' } }, next.status === 'playable' ? L(next, 'tagline') : L(next, 'teaser'))) : null,
      h('div.spacer'),
      h('button.btn.primary.block', { onclick: () => app.go('map'), 'data-testid': 'to-map' }, t('ui.backToMap')),
      h('button.btn.block', { style: { marginTop: '8px' }, onclick: () => app.go('logbook') }, '📖 ', t('nav.logbook')),
    );
    app.sfx('success');
  }

  intro();
  return { el: root, worldId: world };
}
