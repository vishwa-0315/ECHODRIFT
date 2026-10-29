/** For now every level is open; set to false to unlock levels one by one again. */
export const ALL_LEVELS_OPEN = true;

/** Quick-play progress: stars per level, unlocks, badges, rocket colours, quiz score. */
import { LEVELS, CHAPTERS } from '../arcade/levels.js';

export const SKINS = [
  { id: 'classic', name: 'Classic', need: 0, body: '#f2f4f8', trim: '#ff9933', flame: '#ffb347' },
  { id: 'tiranga', name: 'Tiranga', need: 4, body: '#ffffff', trim: '#ff9933', trim2: '#138808', flame: '#ffcf66' },
  { id: 'gold', name: 'Gold foil', need: 9, body: '#e8c15a', trim: '#b8862b', flame: '#ffd27a' },
  { id: 'comet', name: 'Comet', need: 14, body: '#bdf3ff', trim: '#4cc9f0', flame: '#7ff3ff' },
  { id: 'redplanet', name: 'Red Planet', need: 19, body: '#ffd2bf', trim: '#d1502b', flame: '#ff7b4a' },
  { id: 'lunar', name: 'Moon dust', need: 24, body: '#cfd2d8', trim: '#6b7280', flame: '#e5e7eb' },
  { id: 'saturn', name: 'Saturn rings', need: 30, body: '#f1e3b8', trim: '#b8955a', trim2: '#e9d8a6', flame: '#ffe2a0' },
  { id: 'neptune', name: 'Deep Neptune', need: 36, body: '#9fb7ff', trim: '#2f49b8', flame: '#8fb0ff' },
  { id: 'quizwhiz', name: 'Quiz whiz', need: 0, quiz: 1, body: '#e2ccff', trim: '#8b5cf6', flame: '#c4b5fd' },
  { id: 'aurora', name: 'Aurora', need: 0, quiz: 3, body: '#c8ffe8', trim: '#10b981', trim2: '#8b5cf6', flame: '#6ee7b7' },
  { id: 'heritage', name: 'Heritage', need: 0, cards: 10, body: '#f5e6c8', trim: '#8b5a2b', trim2: '#ff9933', flame: '#ffc56b' },
];

export const BADGES = [
  { id: 'first', icon: '', name: 'First flight', desc: 'Finish your first level' },
  { id: 'moon', icon: '', name: 'Moon master', desc: 'Finish every Moon level' },
  { id: 'mars', icon: '', name: 'Red planet', desc: 'Finish every Mars & beyond level' },
  { id: 'perfect', icon: '', name: 'Perfect pilot', desc: 'Get 3 stars on a level' },
  { id: 'feather', icon: '', name: 'Feather touch', desc: 'Land at under 1 m/s' },
  { id: 'quiz', icon: '', name: 'Quiz whiz', desc: 'Answer 10 quiz questions right' },
  { id: 'tryagain', icon: '', name: 'Never give up', desc: 'Try one level 5 times' },
  { id: 'quizorbit', icon: '', name: 'Quiz to Orbit', desc: 'Reach orbit in the quiz game with no wrong answers' },
  { id: 'allstars', icon: '', name: 'Mission legend', desc: 'Get 3 stars on every level' },
  { id: 'historian', icon: '', name: 'Mission historian', desc: 'Unlock all 30 mission history cards' },
];

/**
 * Pilot ranks, earned with stars (30 levels × 3 = 90 stars). Each rank has
 * divisions (I, II, III…); inside a division you fill rank stars, like a
 * ranked ladder in a sports game. The top rank, Grandmaster, is for
 * professionals: every level perfect AND every Expert mission flown.
 */
const TIERS = [
  { tier: 'Bronze', color: '#c8834f', divs: [0, 2, 4] },
  { tier: 'Silver', color: '#b8c2cf', divs: [6, 8, 10] },
  { tier: 'Gold', color: '#f2c14e', divs: [12, 15, 18, 21] },
  { tier: 'Platinum', color: '#7fe0d6', divs: [24, 27, 30, 33] },
  { tier: 'Diamond', color: '#8ab4ff', divs: [36, 40, 44, 48] },
  { tier: 'Space Walker', color: '#c49bff', divs: [52, 56, 60] },
  { tier: 'Elite Space Walker', color: '#e48bff', divs: [64, 67, 70] },
  { tier: 'Space Master', color: '#ff9e5e', divs: [73, 76, 79] },
  { tier: 'Elite Space Master', color: '#ff6b6b', divs: [82, 85, 88] },
];
const ROMAN = ['I', 'II', 'III', 'IV'];
/** Every rung of the ladder, lowest first. */
export const RANKS = [
  ...TIERS.flatMap((t, ti) => t.divs.map((need, di) => ({ tier: t.tier, div: ROMAN[di], name: `${t.tier} ${ROMAN[di]}`, need, color: t.color, ti }))),
  { tier: 'Grandmaster', div: '', name: 'Grandmaster', need: 90, color: '#ffd700', ti: TIERS.length, pro: true },
];
export const RANK_TIERS = [...TIERS.map((t) => ({ tier: t.tier, color: t.color, from: t.divs[0] })), { tier: 'Grandmaster', color: '#ffd700', from: 90, pro: true }];
/** Current rank. expertDone = Expert missions completed (Grandmaster needs all of them). */
export function rankFor(stars, expertDone = 0, expertTotal = 8) {
  const pro = stars >= 90 && expertDone >= expertTotal;
  const ladder = RANKS.filter((r) => !r.pro || pro);
  const i = ladder.filter((r) => stars >= r.need).length - 1;
  const r = ladder[Math.max(0, i)];
  const nx = ladder[i + 1] || null;
  // rank stars inside this division (filled / slots), like a ranked ladder
  const slots = nx ? Math.max(1, nx.need - r.need) : 1;
  const filled = nx ? stars - r.need : 1;
  return { ...r, next: nx, slots: Math.min(slots, 5), filled: Math.min(filled, 5), index: RANKS.indexOf(r) };
}
export const nextRank = (stars, expertDone = 0) => rankFor(stars, expertDone).next;

export const CERTS = [
  { id: 'bronze', tier: 'Bronze', title: 'Space Explorer', levels: 10, stars: 0, color: '#b87333' },
  { id: 'silver', tier: 'Silver', title: 'Mission Pilot', levels: 20, stars: 45, color: '#9aa4b2' },
  { id: 'gold', tier: 'Gold', title: 'Mission Commander', levels: 30, stars: 75, color: '#d4a017' },
  { id: 'platinum', tier: 'Platinum', title: 'Space Legend', levels: 30, stars: 90, color: '#4cc9f0' },
];

/** Today's mission: one level a day, the same for everyone on that date. */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function dailyLevel(d = new Date()) {
  const k = dayKey(d);
  let hsh = 0;
  for (const c of k) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return LEVELS[hsh % LEVELS.length];
}

export function progress(app) {
  const s = (app.save.arcade ||= { stars: {}, tries: {}, badges: {}, quizRight: 0, quizSeen: [], skin: 'classic' });
  const p = {
    data: s,
    stars: (id) => s.stars[id] || 0,
    total: () => Object.values(s.stars).reduce((a, b) => a + b, 0),
    unlocked(id) {
      if (ALL_LEVELS_OPEN) return true;
      const i = LEVELS.findIndex((l) => l.id === id);
      return i <= 0 || p.stars(id) > 0 || p.stars(LEVELS[i - 1].id) > 0;
    },
    expertDone: () => Object.values(app.save.missions || {}).filter((m) => m.done).length,
    rank: () => rankFor(p.total(), p.expertDone(), (app.content?.missions || []).length || 8),
    levelsDone: () => LEVELS.filter((l) => p.stars(l.id) > 0 && (s.proof || {})[l.id]?.n > 0).length,
    /** Stars backed by a recorded flight (stars without a flight record don't count for certificates). */
    verifiedStars: () => LEVELS.reduce((a, l) => a + Math.min(p.stars(l.id), (s.proof || {})[l.id]?.s || 0), 0),
    tampered: () => !!s.tampered,
    /** Wipe quick-play progress (used after the save was changed outside the game). */
    resetProgress() {
      app.save.arcade = { stars: {}, tries: {}, badges: {}, quizRight: 0, quizSeen: [], skin: 'classic' };
      app.save.missions = {};
      app.save.labs = {};
      app.persist();
    },
    certEarned: (id) => (s.certs || {})[id] || 0,
    profile: () => (app.save.profile ||= { name: '', school: '', grade: '', city: '' }),
    setProfile(pf) {
      app.save.profile = { ...p.profile(), ...pf };
      app.persist();
    },
    dailyDoneToday: () => s.dailyDone === dayKey(),
    dailyStreak: () => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return s.dailyDone === dayKey() || s.dailyDone === dayKey(y) ? s.dailyStreak || 0 : 0;
    },
    nextLevel() {
      return LEVELS.find((l) => !p.stars(l.id) && p.unlocked(l.id)) || null;
    },
    /** quiz: best Quiz to Orbit result needed (1 = reach orbit, 3 = three stars) */
    skinOpen: (k) => p.total() >= k.need && (!k.quiz || (s.quizGameBest || 0) >= k.quiz) && (!k.cards || p.cardCount() >= k.cards),
    /** Mission history cards: unlocked by answering that mission's quiz question right. */
    card: (id) => !!(s.cards && s.cards[id]),
    cardCount: () => Object.keys(s.cards || {}).length,
    skin: () => SKINS.find((k) => k.id === s.skin && p.skinOpen(k)) || SKINS[0],
    setSkin(id) {
      s.skin = id;
      app.persist();
    },
    tried(id) {
      s.tries[id] = (s.tries[id] || 0) + 1;
      s.streak = 0;
      app.persist();
      return p.award(s.tries[id] >= 5 ? ['tryagain'] : []);
    },
    /** Record a finished level; returns { newBadges, newSkins, best } */
    finish(id, stars, extra = {}) {
      const before = p.total();
      const prevBest = p.stars(id);
      // a record of real flights (demo flights by Vyom never reach here)
      const pr = ((s.proof ||= {})[id] ||= { s: 0, n: 0 });
      pr.s = Math.max(pr.s, stars);
      pr.n++;
      s.stars[id] = Math.max(prevBest, stars);
      s.streak = (s.streak || 0) + 1;
      // today's mission and the daily streak
      let daily = null;
      const today = dayKey();
      if (dailyLevel().id === id && s.dailyDone !== today) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        s.dailyStreak = s.dailyDone === dayKey(y) ? (s.dailyStreak || 0) + 1 : 1;
        s.dailyDone = today;
        daily = s.dailyStreak;
      }
      const after = p.total();
      const earn = ['first'];
      if (stars === 3) earn.push('perfect');
      if (extra.touchdown != null && extra.touchdown < 1) earn.push('feather');
      for (const c of CHAPTERS) if (c.levels.every((l) => p.stars(l) > 0)) earn.push(c.id);
      if (LEVELS.every((l) => p.stars(l.id) === 3)) earn.push('allstars');
      const newSkins = SKINS.filter((k) => !k.quiz && k.need > before && k.need <= after);
      app.persist();
      // certificates: remember the date each one was first earned
      const done = p.levelsDone();
      const newCerts = s.tampered ? [] : CERTS.filter((c) => !(s.certs ||= {})[c.id] && done >= c.levels && p.verifiedStars() >= c.stars);
      for (const c of newCerts) s.certs[c.id] = Date.now();
      const ex = Object.values(app.save.missions || {}).filter((m) => m.done).length;
      const rankUp = rankFor(after, ex).index > rankFor(before, ex).index ? { ...rankFor(after, ex), from: rankFor(before, ex) } : null;
      return { newBadges: p.award(earn), newSkins, improved: prevBest > 0 && stars > prevBest, firstWin: prevBest === 0, streak: s.streak, daily, rankUp, newCerts };
    },
    /** Finished a Quiz to Orbit game with `stars` (0 = did not reach orbit). */
    quizGame(stars) {
      const before = s.quizGameBest || 0;
      s.quizGameBest = Math.max(before, stars);
      s.quizGames = (s.quizGames || 0) + 1;
      app.persist();
      const newSkins = SKINS.filter((k) => k.quiz && k.quiz > before && k.quiz <= s.quizGameBest);
      return { newSkins, newBadges: p.award(stars === 3 ? ['quizorbit'] : []) };
    },
    /** Quiz to Orbit hints: 3 to use over every 6 questions (the pool refills after each set of 6). */
    hintsLeft: () => (s.hintBlock ||= { left: 3, n: 0 }).left,
    useHint() {
      const hb = (s.hintBlock ||= { left: 3, n: 0 });
      if (hb.left <= 0) return false;
      hb.left--;
      app.persist();
      return true;
    },
    /** Next question index from `pool` (array of {i}), never repeating one until all have been seen. */
    pickQuestion(pool, total) {
      if (s.quizSeen.length >= total) s.quizSeen = []; // every question seen: start a new round
      const fresh = pool.filter((q) => !s.quizSeen.includes(q.i));
      return fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : null;
    },
    /** level: the mission this question belongs to ('general' for none). Sets p.newCard / p.newSkins when something unlocks. */
    quiz(right, qIndex, level, fromGame = false) {
      if (!s.quizSeen.includes(qIndex)) s.quizSeen.push(qIndex);
      if (right) s.quizRight++;
      if (fromGame) {
        const hb = (s.hintBlock ||= { left: 3, n: 0 });
        if (++hb.n >= 6) ((hb.n = 0), (hb.left = 3));
      }
      p.newCard = null;
      p.newSkins = [];
      const earn = s.quizRight >= 10 ? ['quiz'] : [];
      if (right && level && LEVELS.some((l) => l.id === level) && !p.card(level)) {
        const before = p.cardCount();
        (s.cards ||= {})[level] = Date.now();
        p.newCard = level;
        p.newSkins = SKINS.filter((k) => k.cards && k.cards > before && k.cards <= p.cardCount());
        if (LEVELS.every((l) => p.card(l.id))) earn.push('historian');
      }
      app.persist();
      return p.award(earn);
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
