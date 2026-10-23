// Physics validation: the engine must agree with exact analytic results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDopri } from '../src/core/ode.js';
import { elements, keplerPropagate, lambert, vCirc, visViva } from '../src/core/orbit.js';
import { MU, RADIUS, AU, DAY, G0 } from '../src/core/constants.js';
import { burnTime, deltaV, propellantFor } from '../src/core/ship.js';
import { createEphemeris, helioState, geoState } from '../src/core/ephem.js';
import { createOrbitalSim } from '../src/core/orbitalsim.js';

function twoBody(mu) {
  return (t, y, d) => {
    const r3 = Math.hypot(y[0], y[1]) ** 3;
    d[0] = y[2];
    d[1] = y[3];
    d[2] = (-mu * y[0]) / r3;
    d[3] = (-mu * y[1]) / r3;
  };
}

test('DOPRI5: 100 low-Earth orbits keep energy to 2e-7 and radius within 50 m', () => {
  const mu = MU.earth;
  const r = RADIUS.earth + 400e3;
  const y = [r, 0, 0, vCirc(mu, r)];
  const ig = createDopri(twoBody(mu), 4, { rtol: 1e-11, atol: [1e-3, 1e-3, 1e-6, 1e-6], h0: 10 });
  const T = 2 * Math.PI * Math.sqrt(r ** 3 / mu);
  const e0 = elements(...y, mu).energy;
  ig.advance(0, y, 100 * T);
  const el = elements(...y, mu);
  assert.ok(Math.abs((el.energy - e0) / e0) < 2e-7, `energy drift ${(el.energy - e0) / e0}`);
  assert.ok(Math.abs(Math.hypot(y[0], y[1]) - r) < 50, `radius error ${Math.hypot(y[0], y[1]) - r} m`);
});

test('integrator matches the exact Kepler solution on an eccentric orbit (<10 m after 3.7 orbits)', () => {
  const mu = MU.earth;
  const s = { x: RADIUS.earth + 300e3, y: 0, vx: 0, vy: 10.3e3 }; // highly elliptical
  const el = elements(s.x, s.y, s.vx, s.vy, mu);
  const dt = 3.7 * el.period;
  const y = [s.x, s.y, s.vx, s.vy];
  createDopri(twoBody(mu), 4, { rtol: 1e-12, atol: [1e-4, 1e-4, 1e-8, 1e-8], h0: 1 }).advance(0, y, dt);
  const k = keplerPropagate(s.x, s.y, s.vx, s.vy, mu, dt);
  const err = Math.hypot(y[0] - k.x, y[1] - k.y);
  assert.ok(err < 10, `position error ${err.toFixed(2)} m`);
});

test('Lambert solver: Earth→Mars style transfer arrives where it should (<5 km)', () => {
  const mu = MU.sun;
  const r1 = [AU, 0];
  const r2 = [-1.2 * AU, 0.9 * AU];
  const tof = 230 * DAY;
  const sol = lambert(r1, r2, tof, mu);
  assert.ok(sol);
  const k = keplerPropagate(r1[0], r1[1], sol.v1[0], sol.v1[1], mu, tof);
  const err = Math.hypot(k.x - r2[0], k.y - r2[1]);
  assert.ok(err < 5e3, `miss ${(err / 1e3).toFixed(2)} km`);
});

test('rocket equation and finite-burn duration', () => {
  const isp = 318, F = 440, m0 = 1337.2;
  const dv = 1000;
  const prop = propellantFor(dv, isp, m0);
  assert.ok(Math.abs(deltaV(isp, m0, m0 - prop) - dv) < 1e-9);
  const tb = burnTime(dv, isp, F, m0);
  assert.ok(Math.abs(tb - (prop * isp * G0) / F) < 1e-6); // t = m_prop / ṁ
});

test('real ephemerides: Earth at ~1 AU, Mars between perihelion and aphelion', () => {
  const d = new Date('2014-09-24T02:10:00Z');
  const e = helioState('earth', d);
  const m = helioState('mars', d);
  assert.ok(Math.abs(Math.hypot(e.x, e.y, e.z) / AU - 1) < 0.0175);
  const rm = Math.hypot(m.x, m.y, m.z) / AU;
  assert.ok(rm > 1.381 && rm < 1.667, `Mars at ${rm} AU`);
  const moon = geoState('moon', d);
  const dm = Math.hypot(moon.x, moon.y, moon.z) / 1e3;
  assert.ok(dm > 356000 && dm < 407000, `Moon at ${dm} km`);
});

test('ephemerides agree with JPL Keplerian elements (Mars longitude within 0.1°)', () => {
  // JPL "Keplerian Elements for Approximate Positions of the Major Planets", Table 1
  const T = (Date.UTC(2014, 8, 24) / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const a = 1.52371034 + 0.00001847 * T, e = 0.0933941 + 0.00007882 * T;
  const L = -4.55343205 + 19140.30268499 * T, wbar = -23.94362959 + 0.44441088 * T;
  const M = (((L - wbar) % 360) + 360) % 360 * (Math.PI / 180);
  let E = M;
  for (let i = 0; i < 30; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const lonJPL = ((((nu * 180) / Math.PI + wbar) % 360) + 360) % 360; // ~ ecliptic longitude (small inclination)
  const m = helioState('mars', new Date(Date.UTC(2014, 8, 24)));
  const lon = (((Math.atan2(m.y, m.x) * 180) / Math.PI) % 360 + 360) % 360;
  let diff = Math.abs(lon - lonJPL);
  if (diff > 180) diff = 360 - diff;
  assert.ok(diff < 0.1, `longitude differs by ${diff.toFixed(3)}°`);
});

test('ephemeris interpolation error is below 1 km (Moon, 3-hour table)', () => {
  const epoch = new Date('2023-08-01T00:00:00Z');
  const eph = createEphemeris({ center: 'earth', bodies: ['moon'], epoch, span: 10 * DAY, step: 3 * 3600 });
  let worst = 0;
  for (let t = 1000; t < 9 * DAY; t += 37777) {
    const s = eph.state('moon', t, {});
    const g = geoState('moon', new Date(epoch.getTime() + t * 1000));
    worst = Math.max(worst, Math.hypot(s.x - g.x, s.y - g.y));
  }
  assert.ok(worst < 1000, `worst ${worst.toFixed(1)} m`);
});

test('orbital sim: a finite prograde burn raises apogee as vis-viva predicts (gravity losses < 2%)', () => {
  const r = RADIUS.earth + 200e3;
  const sim = createOrbitalSim({
    epoch: '2023-07-15T00:00:00Z', span: 2 * DAY, central: 'earth', perturbers: [],
    ship: { wetMass: 3900, dryMass: 2000, engine: { thrust: 20000, isp: 315 } }, // short burn ≈ impulsive
    state: { x: r, y: 0, vx: 0, vy: vCirc(MU.earth, r) },
  });
  const dv = 300;
  sim.addNode({ t: 4000, dv, angle: 0, ref: 'earth' });
  sim.advance(4000 + 3000);
  const el = sim.elementsAbout('earth');
  // impulsive prediction
  const vp = vCirc(MU.earth, r) + dv;
  const a = 1 / (2 / r - (vp * vp) / MU.earth);
  const apoIdeal = 2 * a - r;
  const ratio = (el.apo - r) / (apoIdeal - r);
  assert.ok(ratio > 0.98 && ratio <= 1.0005, `apogee ratio ${ratio}`);
  assert.ok(Math.abs(sim.deliveredDv - dv) < 1e-6 * dv);
});

test('the trajectory preview is the real future (same model, same answer)', () => {
  const r = RADIUS.earth + 200e3;
  const mk = () =>
    createOrbitalSim({
      epoch: '2023-08-01T00:00:00Z', span: 6 * DAY, central: 'earth', perturbers: ['moon', 'sun'],
      ship: { wetMass: 3900, dryMass: 2000, engine: { thrust: 440, isp: 315 } },
      state: { x: r, y: 0, vx: 0, vy: 10.9e3 },
    });
  const a = mk();
  a.addNode({ t: 3600, dv: 50, angle: 0, ref: 'earth' });
  const pred = a.predict(2 * DAY, 600);
  a.advance(2 * DAY);
  const err = Math.hypot(pred.final[0] - a.y[0], pred.final[1] - a.y[1]);
  assert.ok(err < 50, `preview vs reality after 2 days: ${err.toFixed(2)} m`);
});

test('a long, weak burn suffers real gravity losses (440 N engine, 42-minute burn)', () => {
  const r = RADIUS.earth + 200e3;
  const mk = (thrust) => {
    const sim = createOrbitalSim({
      epoch: '2023-07-15T00:00:00Z', span: 2 * DAY, central: 'earth', perturbers: [],
      ship: { wetMass: 3900, dryMass: 2000, engine: { thrust, isp: 315 } },
      state: { x: r, y: 0, vx: 0, vy: vCirc(MU.earth, r) },
    });
    sim.addNode({ t: 4000, dv: 300, angle: 0, ref: 'earth' });
    sim.advance(9000);
    return sim.elementsAbout('earth').apo;
  };
  const strong = mk(20000);
  const weak = mk(440);
  assert.ok((weak - r) / (strong - r) < 0.9, 'weak engine should gain much less apogee for the same Δv');
});
