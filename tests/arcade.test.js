// Quick-play: physics sanity and "every level can be won" proofs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/arcade/physics.js';
import { LEVELS } from '../src/arcade/levels.js';
import { MU, G0 } from '../src/core/constants.js';

test('coasting orbit conserves energy and returns after one Kepler period', () => {
  const mu = MU.earth, r = 7000e3, v = Math.sqrt(mu / r) * 1.1;
  const w = createWorld({ central: { name: 'earth', mu, R: 6378e3 }, bodies: [], ship: { x: r, y: 0, vx: 0, vy: v, mass: 1000, dry: 900, thrust: 0, isp: 300 } });
  const o0 = w.orbitAbout('earth');
  w.advance(o0.period);
  const o1 = w.orbitAbout('earth');
  assert.ok(Math.abs(o1.energy - o0.energy) / Math.abs(o0.energy) < 2e-6, 'energy drift');
  assert.ok(Math.hypot(w.y[0] - r, w.y[1]) < 50, 'back to start after one period');
});

test('engine burn follows the rocket equation', () => {
  const mu = MU.earth;
  const w = createWorld({ central: { name: 'earth', mu, R: 6378e3 }, bodies: [], ship: { x: 7000e3, y: 0, vx: 0, vy: 7546, mass: 1000, dry: 600, thrust: 440, isp: 315 } });
  w.burn = { dir: 'pro' };
  w.advance(600);
  const expected = 315 * G0 * Math.log(1000 / w.y[4]);
  assert.ok(Math.abs(w.dvUsed - expected) < 1e-6);
  assert.ok(Math.abs(1000 - w.y[4] - (440 / (315 * G0)) * 600) < 0.01, 'mass flow F/(Isp·g0)');
});

test('restricted three-body: Moon moves on its real orbit (27.3-day sidereal period)', () => {
  const w = createWorld({ central: { name: 'earth', mu: MU.earth, R: 6378e3 }, bodies: [{ name: 'moon', mu: MU.moon, R: 1737e3, a: 384400e3 }], ship: { x: 7000e3, y: 0, vx: 0, vy: 7546, mass: 1, dry: 1, thrust: 0, isp: 1 } });
  const T = (2 * Math.PI) / w.body('moon').w / 86400;
  assert.ok(Math.abs(T - 27.3) < 0.15, `period ${T}`);
});

for (const L of LEVELS) {
  test(`level "${L.title}" can be won with the real physics`, () => {
    const g = L.create();
    let t = 0, prevTap = false;
    while (g.status === 'play' && t < 300) {
      const b = g.bot();
      const tap = !!b.tap && !prevTap;
      prevTap = !!b.tap;
      g.update(1 / 60, { hold: !!b.hold, tap, aim: b.aim ?? 0 });
      t += 1 / 60;
    }
    assert.equal(g.status, 'won', g.reason);
    assert.ok(g.stars >= 1 && g.stars <= 3);
    assert.ok(t < 70, `level should be short (took ${t.toFixed(0)} s)`);
  });
}

test('doing nothing fails the levels that need a burn (no free wins)', () => {
  for (const id of ['raise', 'catchmoon', 'vikram', 'marscapture']) {
    const g = LEVELS.find((l) => l.id === id).create();
    let t = 0;
    while (g.status === 'play' && t < 300) {
      g.update(1 / 60, { hold: false, tap: false, aim: 0 });
      t += 1 / 60;
    }
    assert.equal(g.status, 'lost', id);
  }
});
