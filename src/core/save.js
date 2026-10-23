/**
 * ECHO DRIFT — versioned save system (pure logic + pluggable storage).
 *
 *  - Every save carries `schemaVersion`; `migrate()` upgrades old saves step by step.
 *  - Two rotating backups: a corrupt main save falls back to the last good copy.
 *  - Storage is injected (localStorage in the browser, a Map in tests), and every
 *    access is wrapped in try/catch, so a blocked storage never crashes the game.
 */

export const SCHEMA_VERSION = 2;
const KEY = 'echodrift.save';
const BAK = ['echodrift.save.bak1', 'echodrift.save.bak2'];

export const PHASES = ['intro', 'fly', 'investigate', 'build', 'report', 'forge', 'debrief', 'done'];

export function defaultSettings() {
  return {
    sound: true,
    music: true,
    haptics: true,
    lang: 'en',
    colorblind: false,
    textSize: 1,
    reduceMotion: false,
    track: 'cadet',
    graphics: 'high',
    dyslexiaFont: false,
    fullPreview: false,
    sessionNudgeMin: 0,
  };
}

export function freshSave(worldIds = []) {
  const worlds = {};
  worldIds.forEach((id, i) => (worlds[id] = freshWorld(i === 0)));
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    trackChosen: false,
    settings: defaultSettings(),
    worlds,
    ghosts: {},
    logbook: { fragments: [], facts: [], clues: [], gallery: [], badges: [] },
    evidence: [],
    timePlayed: { total: 0, perWorld: {} },
    tutorialsSeen: {},
    sandboxUnlocked: false,
  };
}

export function freshWorld(unlocked = false) {
  return { unlocked, phase: 'intro', levelIndex: 0, levelStars: {}, hypothesis: null, complete: false, quizScore: null, glyphSolved: false };
}

/** Migrations: index = from-version. Each returns the next version's shape. */
const MIGRATIONS = {
  // v1 kept stars in a flat map and called the difficulty "difficulty".
  1: (s) => {
    const out = { ...s, schemaVersion: 2 };
    out.settings = { ...defaultSettings(), ...(s.settings || {}) };
    if (s.settings?.difficulty) out.settings.track = s.settings.difficulty;
    delete out.settings.difficulty;
    out.worlds = s.worlds || {};
    for (const [levelId, stars] of Object.entries(s.stars || {})) {
      const worldId = levelId.split('-')[0];
      out.worlds[worldId] = out.worlds[worldId] || freshWorld(true);
      out.worlds[worldId].levelStars = out.worlds[worldId].levelStars || {};
      out.worlds[worldId].levelStars[levelId] = stars;
    }
    delete out.stars;
    out.ghosts = s.ghosts || {};
    out.evidence = s.evidence || [];
    out.logbook = s.logbook || { fragments: [], facts: [], clues: [], gallery: [], badges: [] };
    out.timePlayed = s.timePlayed || { total: 0, perWorld: {} };
    out.tutorialsSeen = s.tutorialsSeen || {};
    return out;
  },
};

export function migrate(save) {
  let s = save;
  let guard = 0;
  while ((s.schemaVersion ?? 1) < SCHEMA_VERSION) {
    const v = s.schemaVersion ?? 1;
    const fn = MIGRATIONS[v];
    if (!fn || guard++ > 20) throw new Error(`No migration from v${v}`);
    s = fn(s);
  }
  return s;
}

/** Minimal structural check so a half-written save is rejected. */
export function isValidSave(s) {
  return !!s && typeof s === 'object' && typeof s.worlds === 'object' && typeof s.settings === 'object' && Array.isArray(s.evidence);
}

/** Make sure newly added worlds/settings exist in an older save. */
export function reconcile(save, worldIds) {
  save.settings = { ...defaultSettings(), ...save.settings };
  worldIds.forEach((id, i) => {
    if (!save.worlds[id]) save.worlds[id] = freshWorld(i === 0);
  });
  save.logbook = { fragments: [], facts: [], clues: [], gallery: [], badges: [], ...save.logbook };
  return save;
}

export function createStore(storage) {
  const get = (k) => {
    try {
      return storage.getItem(k);
    } catch {
      return null;
    }
  };
  const set = (k, v) => {
    try {
      storage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  };
  return {
    load(worldIds) {
      for (const k of [KEY, ...BAK]) {
        const raw = get(k);
        if (!raw) continue;
        try {
          const s = migrate(JSON.parse(raw));
          if (isValidSave(s)) return { save: reconcile(s, worldIds), source: k };
        } catch {
          /* corrupt — try the next backup */
        }
      }
      return { save: freshSave(worldIds), source: 'fresh' };
    },
    save(save) {
      const json = JSON.stringify(save);
      const prev = get(KEY);
      if (prev && prev !== json) {
        const b1 = get(BAK[0]);
        if (b1) set(BAK[1], b1);
        set(BAK[0], prev);
      }
      return set(KEY, json);
    },
    clear() {
      for (const k of [KEY, ...BAK]) {
        try {
          storage.removeItem(k);
        } catch {
          /* ignore */
        }
      }
    },
  };
}

/** In-memory storage (tests, or when browser storage is blocked). */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

/** Concept mastery: a concept is mastered with >= 2 pieces of evidence. */
export function masteredConcepts(save, threshold = 2) {
  const counts = {};
  for (const e of save.evidence) counts[e.concept] = (counts[e.concept] || 0) + 1;
  return Object.entries(counts)
    .filter(([, n]) => n >= threshold)
    .map(([c]) => c);
}

export function addEvidence(save, concept, source) {
  if (save.evidence.some((e) => e.concept === concept && e.source === source)) return false;
  save.evidence.push({ concept, source, at: Date.now() });
  return true;
}

/** Score a debrief quiz: answers = {questionId: optionIndex}. */
export function scoreQuiz(quiz, answers) {
  let correct = 0;
  for (const q of quiz.questions) if (answers[q.id] === q.correct) correct++;
  return { correct, total: quiz.questions.length };
}
