/** Quick-play progress: stars per level, unlocks, badges, rocket colours, quiz score. */
import { LEVELS, CHAPTERS } from '../arcade/levels.js';

export const SKINS = [
  { id: 'classic', name: 'Classic', need: 0, body: '#f2f4f8', trim: '#ff9933', flame: '#ffb347' },
  { id: 'tiranga', name: 'Tiranga', need: 4, body: '#ffffff', trim: '#ff9933', trim2: '#138808', flame: '#ffcf66' },
  { id: 'gold', name: 'Gold foil', need: 10, body: '#e8c15a', trim: '#b8862b', flame: '#ffd27a' },
  { id: 'comet', name: 'Comet', need: 16, body: '#bdf3ff', trim: '#4cc9f0', flame: '#7ff3ff' },
  { id: 'redplanet', name: 'Red Planet', need: 22, body: '#ffd2bf', trim: '#d1502b', flame: '#ff7b4a' },
];

export const BADGES = [
  { id: 'first', icon: '🚀', name: 'First flight', desc: 'Finish your first level' },
  { id: 'moon', icon: '🌙', name: 'Moon master', desc: 'Finish every Moon level' },
  { id: 'mars', icon: '🔴', name: 'Red planet', desc: 'Finish every Mars & beyond level' },
  { id: 'perfect', icon: '⭐', name: 'Perfect pilot', desc: 'Get 3 stars on a level' },
  { id: 'feather', icon: '🪶', name: 'Feather touch', desc: 'Land at under 1 m/s' },
  { id: 'quiz', icon: '🧠', name: 'Quiz whiz', desc: 'Answer 10 quiz questions right' },
  { id: 'tryagain', icon: '💪', name: 'Never give up', desc: 'Try one level 5 times' },
  { id: 'allstars', icon: '🏆', name: 'Mission legend', desc: 'Get 3 stars on every level' },
];

export function progress(app) {
  const s = (app.save.arcade ||= { stars: {}, tries: {}, badges: {}, quizRight: 0, quizSeen: [], skin: 'classic' });
  const p = {
    data: s,
    stars: (id) => s.stars[id] || 0,
    total: () => Object.values(s.stars).reduce((a, b) => a + b, 0),
    unlocked(id) {
      const i = LEVELS.findIndex((l) => l.id === id);
      return i <= 0 || p.stars(LEVELS[i - 1].id) > 0;
    },
    nextLevel() {
      return LEVELS.find((l) => !p.stars(l.id) && p.unlocked(l.id)) || null;
    },
    skin: () => SKINS.find((k) => k.id === s.skin && p.total() >= k.need) || SKINS[0],
    setSkin(id) {
      s.skin = id;
      app.persist();
    },
    tried(id) {
      s.tries[id] = (s.tries[id] || 0) + 1;
      app.persist();
      return p.award(s.tries[id] >= 5 ? ['tryagain'] : []);
    },
    /** Record a finished level; returns { newBadges, newSkins, best } */
    finish(id, stars, extra = {}) {
      const before = p.total();
      s.stars[id] = Math.max(p.stars(id), stars);
      const after = p.total();
      const earn = ['first'];
      if (stars === 3) earn.push('perfect');
      if (extra.touchdown != null && extra.touchdown < 1) earn.push('feather');
      for (const c of CHAPTERS) if (c.levels.every((l) => p.stars(l) > 0)) earn.push(c.id);
      if (LEVELS.every((l) => p.stars(l.id) === 3)) earn.push('allstars');
      const newSkins = SKINS.filter((k) => k.need > before && k.need <= after);
      app.persist();
      return { newBadges: p.award(earn), newSkins };
    },
    quiz(right, qIndex) {
      if (!s.quizSeen.includes(qIndex)) s.quizSeen.push(qIndex);
      if (right) s.quizRight++;
      app.persist();
      return p.award(s.quizRight >= 10 ? ['quiz'] : []);
    },
    award(ids) {
      const fresh = ids.filter((id) => !s.badges[id]);
      for (const id of fresh) s.badges[id] = Date.now();
      if (fresh.length) app.persist();
      return fresh.map((id) => BADGES.find((b) => b.id === id));
    },
  };
  return p;
}
