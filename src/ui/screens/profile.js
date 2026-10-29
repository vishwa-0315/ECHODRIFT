/** Profile: pilot card, rank with divisions and rank stars, the full ladder and stats. */
import { h, clear, put } from '../dom.js';
import { progress, BADGES, CERTS } from '../../game/progress.js';
import { LEVELS } from '../../arcade/levels.js';
import { vyomNote } from '../guide.js';
import { sfx } from '../audio.js';
import { profileForm } from './certs.js';
import { rankCard, rankLadder } from '../rankBadge.js';

export function profileScreen(app) {
  const prog = progress(app);
  const total = prog.total();
  const rank = prog.rank();
  const details = h('div.profile-details');
  const stat = (v, k) => h('div.stat', h('b', String(v)), h('span.small.muted', k));
  const three = LEVELS.filter((l) => prog.stars(l.id) === 3).length;
  const expertN = (app.content?.missions || []).length || 8;

  function renderDetails(edit = false) {
    clear(details);
    const pf = prog.profile();
    if (edit || !pf.name) {
      put(details, !pf.name ? vyomNote('Tell me about you. Your name goes on the certificates you unlock.', 'happy') : null, profileForm(app, () => renderDetails(false)));
      return;
    }
    put(
      details,
      h('div.pf-card', h('div', h('b', pf.name), h('div.small.muted', [pf.grade, pf.school, pf.city].filter(Boolean).join(' · ') || 'Add your school and city')), h('button.btn.sm', { 'data-testid': 'pf-edit', onclick: () => (sfx.tap(), renderDetails(true)) }, 'Edit')),
    );
  }
  renderDetails();

  const el = h(
    'div.screen.profile',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back to menu', 'data-testid': 'back', onclick: () => app.go('home') }, '←'), h('h2', 'Profile & rank')),
    details,
    rankCard(rank, total, { big: true }),
    h(
      'div.stat-grid',
      stat(`${total}/${LEVELS.length * 3}`, 'stars'),
      stat(`${prog.levelsDone()}/${LEVELS.length}`, 'missions flown'),
      stat(three, 'with 3 stars'),
      stat(`${prog.expertDone()}/${expertN}`, 'Expert missions'),
      stat(`${Object.keys(prog.data.badges).length}/${BADGES.length}`, 'badges'),
      stat(`${prog.cardCount()}/${LEVELS.length}`, 'history cards'),
      stat(prog.data.quizRight || 0, 'quiz answers right'),
      stat(prog.dailyStreak(), 'day streak'),
    ),
    h('div.section', h('h3', 'Rank ladder')),
    h('p.small.muted', 'Every mission star moves you up. Each rank has divisions (I, II, III, IV); fill the rank stars to reach the next one. Grandmaster is for true professionals: all 90 stars and every Expert mission.'),
    rankLadder(rank),
    h('div.row.wrap', { style: { marginTop: '14px', gap: '8px' } }, h('button.btn.grow', { 'data-testid': 'to-certs', onclick: () => app.go('certs') }, `Certificates (${CERTS.filter((c) => prog.certEarned(c.id)).length}/${CERTS.length})`), h('button.btn.grow', { onclick: () => app.go('hangar') }, 'Badges & rockets')),
  );
  return {
    el,
    tour: [
      { sel: '.profile-details', title: 'Your pilot card', text: 'Your name, school and city. They are printed on your certificates.' },
      { sel: '.rank-card', title: 'Your rank', text: 'The shield shows your rank and the chevrons its division. The small stars fill up as you win mission stars.' },
      { sel: '.stat-grid', title: 'Your numbers', text: 'Stars, missions, badges, history cards and your daily streak.' },
      { sel: '.rank-ladder', title: 'The ladder', text: 'Bronze, Silver, Gold, Platinum, Diamond, Space Walker, Elite Space Walker, Space Master, Elite Space Master and, at the top, Grandmaster.' },
    ],
    mounted() {
      el.querySelector('.rank-ladder li.cur')?.classList.add('pulse');
    },
  };
}
