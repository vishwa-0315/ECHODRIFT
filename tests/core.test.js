// Unit tests for the pure game systems. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepShip, specificEnergy, circularSpeed, predictPath, DT, orbitState, initialShip } from '../src/core/physics.js';
import { fuelCost, clampBurn, starRating, FlightSim } from '../src/core/flight.js';
import { ColonySim } from '../src/core/colony.js';
import { evidenceScores, judgeHypothesis, bestSupported, checkLayerOrder, primes } from '../src/core/caseboard.js';
import { starType, lifetimeYears, luminosity, habitableZone, cookStar, lifeStages } from '../src/core/stars.js';
import { moonPhase, lightCurve, roundTripYears } from '../src/core/sky.js';
import { createStore, memoryStorage, migrate, SCHEMA_VERSION, scoreQuiz, masteredConcepts, addEvidence, freshSave } from '../src/core/save.js';
import { validate } from '../src/core/validate.js';

/* ---------------- Physics ---------------- */

const oneBody = { bodies: [{ id: 'p', type: 'planet', mass: 90000, radius: 30, x: 0, y: 0 }], softening: 0 };

test('energy is conserved over 10 circular orbits (< 1% drift)', () => {
  const world = createWorld(oneBody);
  const r = 150;
  const v = circularSpeed(90000, r);
  const s = { x: r, y: 0, vx: 0, vy: v, t: 0 };
  const e0 = specificEnergy(s, world.bodies[0]);
  const period = (2 * Math.PI * r) / v;
  const steps = Math.round((10 * period) / DT);
  for (let i = 0; i < steps; i++) stepShip(world, s);
  const e1 = specificEnergy(s, world.bodies[0]);
  assert.ok(Math.abs((e1 - e0) / e0) < 0.01, `drift ${(((e1 - e0) / e0) * 100).toFixed(3)}%`);
  // and the radius stays put
  assert.ok(Math.abs(Math.hypot(s.x, s.y) - r) / r < 0.01);
});

test('energy conserved on an eccentric orbit (< 1% over 5 orbits)', () => {
  const world = createWorld(oneBody);
  const s = { x: 120, y: 0, vx: 0, vy: circularSpeed(90000, 120) * 1.2, t: 0 };
  const e0 = specificEnergy(s, world.bodies[0]);
  const a = -90000 / (2 * e0);
  const period = 2 * Math.PI * Math.sqrt(a ** 3 / 90000);
  for (let i = 0; i < Math.round((5 * period) / DT); i++) stepShip(world, s);
  assert.ok(Math.abs((specificEnergy(s, world.bodies[0]) - e0) / e0) < 0.01);
});

test('gravity follows the inverse-square law', () => {
  const world = createWorld(oneBody);
  const s1 = { x: 100, y: 0, vx: 0, vy: 0, t: 0 };
  const s2 = { x: 200, y: 0, vx: 0, vy: 0, t: 0 };
  stepShip(world, s1);
  stepShip(world, s2);
  assert.ok(Math.abs(s1.vx / s2.vx - 4) < 0.05);
});

test('trajectory preview matches the live simulation exactly', () => {
  const level = {
    bodies: [
      { id: 'p', type: 'planet', mass: 90000, radius: 30, x: 300, y: 300 },
      { id: 'm', type: 'moon', mass: 4000, radius: 10, orbit: { parent: 'p', radius: 180, phaseDeg: 40 } },
    ],
    hazards: { gusts: [{ start: 0.5, duration: 1, angleDeg: 90, accel: 8 }] },
  };
  const world = createWorld(level);
  const ship = { x: 300, y: 600, vx: 18, vy: -10, t: 0 };
  const preview = predictPath(world, ship, 3, 1);
  const live = { ...ship };
  for (let i = 0; i < Math.round(3 / DT); i++) stepShip(world, live);
  const n = preview.length;
  assert.equal(preview[n - 2], live.x);
  assert.equal(preview[n - 1], live.y);
});

test('moon orbits use the period gravity predicts', () => {
  const world = createWorld({
    bodies: [
      { id: 'p', type: 'planet', mass: 90000, radius: 30, x: 0, y: 0 },
      { id: 'm', type: 'moon', mass: 100, radius: 5, orbit: { parent: 'p', radius: 200 } },
    ],
  });
  const m = world.byId.m;
  const expected = 2 * Math.PI * Math.sqrt(200 ** 3 / 90000);
  assert.ok(Math.abs((2 * Math.PI) / m._omega - expected) < 1e-9);
});

test('orbit indicator: circular = orbiting, fast = escaping, slow = falling', () => {
  const world = createWorld(oneBody);
  const b = world.bodies[0];
  const v = circularSpeed(90000, 150);
  assert.equal(orbitState(world, { x: 150, y: 0, vx: 0, vy: v, t: 0 }, b).status, 'orbiting');
  assert.equal(orbitState(world, { x: 150, y: 0, vx: 0, vy: v * 1.5, t: 0 }, b).status, 'escaping');
  assert.equal(orbitState(world, { x: 150, y: 0, vx: 0, vy: v * 0.2, t: 0 }, b).status, 'falling');
});

test('initialShip places a ship in a circular orbit', () => {
  const world = createWorld(oneBody);
  const s = initialShip(world, { orbit: { body: 'p', radius: 100, phaseDeg: 90 } });
  assert.ok(Math.abs(Math.hypot(s.vx, s.vy) - circularSpeed(90000, 100)) < 1e-9);
});

/* ---------------- Fuel & scoring ---------------- */

test('fuel cost is proportional to delta-v', () => {
  assert.equal(fuelCost(3, 4), 5);
  assert.equal(fuelCost(6, 8, 0.5), 5);
});

test('burns are clamped by fuel left and engine limit', () => {
  const c = clampBurn(30, 40, 20, 100);
  assert.ok(Math.abs(Math.hypot(c.dvx, c.dvy) - 20) < 1e-9);
  const d = clampBurn(30, 40, 1000, 10);
  assert.ok(Math.abs(Math.hypot(d.dvx, d.dvy) - 10) < 1e-9);
});

test('star rating', () => {
  const goals = { fuelLeftPct: 40, hull: 100, time: 30 };
  assert.equal(starRating({ fuelLeftPct: 10, hull: 50, time: 90 }, goals), 1);
  assert.equal(starRating({ fuelLeftPct: 50, hull: 50, time: 90 }, goals), 2);
  assert.equal(starRating({ fuelLeftPct: 50, hull: 100, time: 20 }, goals), 3);
});

test('FlightSim: burning spends fuel and crashing fails', () => {
  const level = {
    id: 't',
    bounds: { w: 600, h: 1000 },
    bodies: [{ id: 'p', type: 'planet', mass: 90000, radius: 40, x: 300, y: 300 }],
    ship: { x: 300, y: 800 },
    objective: { type: 'escape', target: 'p', distance: 5000 },
    fuel: 100,
    maxDvPerBurn: 80,
    maxBurns: 2,
    maxTime: 60,
    goals: { fuelLeftPct: 50, hull: 100, time: 30 },
  };
  const sim = new FlightSim(level);
  sim.burn(0, -60);
  assert.ok(Math.abs(sim.fuel - 40) < 1e-9);
  for (let i = 0; i < 120 * 30 && sim.status === 'flying'; i++) sim.step();
  assert.equal(sim.status, 'fail');
  assert.equal(sim.failReason, 'crash');
});

/* ---------------- Colony ---------------- */

const colonyCfg = {
  ticksPerDay: 10,
  daylight: 0.6,
  gridW: 4,
  gridH: 4,
  crew: 4,
  crewPerHabitat: 2,
  graceTicks: 4,
  start: { power: 30, water: 40, oxygen: 40, food: 40, morale: 70 },
  caps: { power: 40, water: 100, oxygen: 100, food: 100, morale: 100 },
  crewNeeds: { oxygen: 0.5, water: 0.3, food: 0.25 },
  wrongHypothesis: { startMult: 0.6, budgetCut: 3 },
  modules: [
    { id: 'solar', cost: 1, produces: { power: 6 } },
    { id: 'battery', cost: 1, storage: 60 },
    { id: 'water', cost: 2, priority: 2, consumes: { power: 2 }, produces: { water: 4 } },
    { id: 'greenhouse', cost: 2, priority: 3, consumes: { power: 1.5, water: 1.5 }, produces: { food: 2, oxygen: 1 } },
    { id: 'o2gen', cost: 2, priority: 1, consumes: { power: 2.5, water: 1 }, produces: { oxygen: 3 } },
    { id: 'habitat', cost: 1 },
    { id: 'comms', cost: 1, priority: 4, consumes: { power: 1 } },
    { id: 'shield', cost: 1, priority: 5, consumes: { power: 1 }, protects: 0.5, onlyWorlds: ['hollow'] },
  ],
};
const w1 = { id: 'cinder', solar: 1, days: 4, budget: 16, events: [] };

function runColony(sim, max = 1000) {
  sim.start();
  for (let i = 0; i < max && sim.status === 'running'; i++) sim.step();
  return sim.status;
}

test('colony: a balanced base survives', () => {
  const sim = new ColonySim(colonyCfg, w1);
  ['solar', 'solar', 'solar', 'solar', 'battery', 'water', 'greenhouse', 'o2gen', 'habitat', 'habitat'].forEach((m, i) => assert.ok(sim.place(i, m).ok, m));
  assert.equal(runColony(sim), 'won');
});

test('colony: no oxygen production loses, with an explained chain', () => {
  const sim = new ColonySim(colonyCfg, w1);
  ['solar', 'solar', 'water', 'habitat', 'habitat'].forEach((m, i) => sim.place(i, m));
  assert.equal(runColony(sim), 'lost');
  assert.equal(sim.lostBecause, 'oxygen');
  assert.equal(sim.chain.at(-1).key, 'colony.chain.zero');
});

test('colony: power shortage takes low-priority modules offline first', () => {
  const sim = new ColonySim(colonyCfg, w1);
  ['o2gen', 'comms', 'habitat', 'habitat'].forEach((m, i) => sim.place(i, m));
  sim.res.power = 3;
  sim.start();
  sim.step();
  assert.ok(sim.offline.has('comms'));
  assert.ok(!sim.offline.has('o2gen'));
});

test('colony: budget and wrong-hypothesis penalty', () => {
  const sim = new ColonySim(colonyCfg, w1, { penalty: true });
  assert.equal(sim.budget, 13);
  assert.equal(sim.res.oxygen, 24);
  assert.equal(sim.place(0, 'shield').reason, 'unavailable');
});

/* ---------------- Case Board ---------------- */

const inv = {
  answer: 'impact',
  clues: [
    { id: 'a', weights: { impact: 3, volcanism: -1 } },
    { id: 'b', weights: { impact: 2 } },
    { id: 'c', weights: { volcanism: 2, impact: 0 }, redHerring: true },
  ],
};

test('hypothesis scoring', () => {
  const board = { impact: ['a', 'b'], volcanism: ['c'] };
  assert.deepEqual(evidenceScores(board, inv.clues).impact, 5);
  assert.equal(judgeHypothesis(inv, board, 'impact').result, 'correct');
  assert.equal(judgeHypothesis(inv, { volcanism: ['c', 'a'] }, 'volcanism').result, 'wrong');
  assert.equal(judgeHypothesis(inv, { impact: ['a'] }, 'impact').result, 'needMore');
  assert.equal(judgeHypothesis(inv, {}, 'unknown').result, 'unknown');
  assert.equal(bestSupported(['a', 'b', 'c'], inv.clues).hypothesis, 'impact');
});

test('rock layers and primes', () => {
  assert.ok(checkLayerOrder({ layers: [{ id: 'x' }, { id: 'y' }] }, ['x', 'y']));
  assert.ok(!checkLayerOrder({ layers: [{ id: 'x' }, { id: 'y' }] }, ['y', 'x']));
  assert.deepEqual(primes(5), [2, 3, 5, 7, 11]);
});

/* ---------------- Stars ---------------- */

test('star science', () => {
  assert.equal(starType(1), 'sunlike');
  assert.equal(starType(0.2), 'reddwarf');
  assert.equal(starType(15), 'bluegiant');
  assert.ok(Math.abs(lifetimeYears(1) - 1e10) < 1);
  assert.ok(lifetimeYears(0.2) > 1e11 && lifetimeYears(20) < 1e8);
  assert.ok(Math.abs(luminosity(1) - 1) < 1e-9);
  const hz = habitableZone(1);
  assert.ok(hz.inner > 0.9 && hz.inner < 1 && hz.outer > 1.3 && hz.outer < 1.4);
  assert.deepEqual(lifeStages(1), ['sunlike', 'redgiant', 'nebula', 'whitedwarf']);
  assert.equal(lifeStages(30).at(-1), 'blackhole');
  assert.equal(lifeStages(12).at(-1), 'neutronstar');
  assert.ok(cookStar({ mass: 1, ingredients: { Fe: 1, H: 3 } }).fizzle);
  assert.ok(cookStar({ mass: 1, ingredients: { H: 3 } }, { types: ['sunlike'], minHydrogen: 2 }).ok);
  assert.equal(cookStar({ mass: 3, ingredients: { H: 3 } }, { types: ['sunlike'], minHydrogen: 2 }).reason, 'wrongType');
});

/* ---------------- Sky ---------------- */

test('moon phase: known full and new moons', () => {
  // Full moon 2024-04-23 23:49 UTC; new moon 2024-04-08 18:21 UTC
  assert.equal(moonPhase(new Date(Date.UTC(2024, 3, 23, 23, 49))).name, 'full');
  assert.equal(moonPhase(new Date(Date.UTC(2024, 3, 8, 18, 21))).name, 'new');
  assert.equal(roundTripYears(40), 80);
});

test('light curve dips where a planet transits', () => {
  const lc = lightCurve([{ period: 10, depth: 0.01, phase: 2, duration: 0.5 }], 30, 3000, 0);
  assert.ok(lc[Math.round((2.2 / 30) * 3000)] < 0.995);
  assert.ok(lc[Math.round((5 / 30) * 3000)] > 0.999);
});

/* ---------------- Save ---------------- */

test('save round-trip, backups, corrupt fallback', () => {
  const mem = memoryStorage();
  const store = createStore(mem);
  const s = freshSave(['cinder', 'veil']);
  s.worlds.cinder.levelStars['cinder-1'] = 3;
  store.save(s);
  s.worlds.cinder.levelStars['cinder-2'] = 2;
  store.save(s);
  mem.setItem('echodrift.save', '{broken json');
  const { save, source } = store.load(['cinder', 'veil']);
  assert.equal(source, 'echodrift.save.bak1');
  assert.equal(save.worlds.cinder.levelStars['cinder-1'], 3);
});

test('save migration v1 → v2', () => {
  const v1 = { schemaVersion: 1, settings: { difficulty: 'commander', sound: false }, stars: { 'cinder-1': 2 }, worlds: {} };
  const v2 = migrate(v1);
  assert.equal(v2.schemaVersion, SCHEMA_VERSION);
  assert.equal(v2.settings.track, 'commander');
  assert.equal(v2.settings.sound, false);
  assert.equal(v2.worlds.cinder.levelStars['cinder-1'], 2);
  assert.equal(v2.stars, undefined);
});

test('storage that throws never crashes the game', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('x'); } };
  const store = createStore(bad);
  assert.equal(store.load(['cinder']).source, 'fresh');
  assert.equal(store.save(freshSave(['cinder'])), false);
});

test('quiz scoring and concept mastery', () => {
  const quiz = { questions: [{ id: 'a', correct: 1 }, { id: 'b', correct: 0 }, { id: 'c', correct: 2 }] };
  assert.deepEqual(scoreQuiz(quiz, { a: 1, b: 1, c: 2 }), { correct: 2, total: 3 });
  const s = freshSave(['cinder']);
  addEvidence(s, 'gravity', 'flight:cinder-1');
  assert.equal(addEvidence(s, 'gravity', 'flight:cinder-1'), false);
  addEvidence(s, 'gravity', 'quiz:cinder:q1');
  assert.deepEqual(masteredConcepts(s), ['gravity']);
});

/* ---------------- Validator ---------------- */

test('content validator reports readable errors', () => {
  const errs = validate({ a: 1, list: ['x', 2] }, { a: 'string', list: ['string'], 'opt?': 'number', must: 'number' }, 'file.json');
  assert.deepEqual(errs, ['file.json.a: expected string, got number', 'file.json.list[1]: expected string, got number', 'file.json.must: missing required field']);
});
