import test from 'node:test';
import assert from 'node:assert/strict';
import { Lander, guidance } from '../src/core/lander.js';
import { EntrySim, marsAtmosphere } from '../src/core/edl.js';
import { keplerMass, rvMinMass, chirpMassOf, chirpMass, chirpFrequency, blackHoleMassFromShadow, minDensityForSpin } from '../src/core/labs.js';
import { G0, MSUN, MJUP, DAY, PC } from '../src/core/constants.js';

const flat = { base: 0 };
const lm = (over = {}) => new Lander({ g: 1.62, engine: { thrust: 45040, isp: 305, minThrottle: 0.1 }, dryMass: 6800, mass: 7500, z: 150, vx: 0, vz: 0, limits: { vz: 3, vx: 1.2, tilt: 12 }, terrain: flat, ...over });

test('lander free fall matches z = z0 − ½gt² exactly', () => {
  const l = lm();
  l.throttleCmd = 0;
  for (let i = 0; i < 600; i++) l.step(1 / 120);
  assert.ok(Math.abs(l.z - (150 - 0.5 * 1.62 * 25)) < 1e-6);
});

test('lander burn obeys the rocket equation (zero gravity)', () => {
  const l = lm({ g: 0, z: 1e6 });
  l.throttleCmd = 1;
  const m0 = l.mass;
  for (let i = 0; i < 1200; i++) l.step(1 / 120);
  const dv = l.vz;
  const ideal = 305 * G0 * Math.log(m0 / l.mass);
  assert.ok(Math.abs(dv - ideal) / ideal < 1e-6, `${dv} vs ${ideal}`);
});

test('throttle can not go below the engine minimum', () => {
  const l = lm();
  l.throttleCmd = 0.02;
  assert.equal(l.thrust(), 0.1 * 45040);
});

test('guidance lands an Apollo-class lander softly', () => {
  const l = lm({ z: 150, vx: 10, vz: -4, mass: 7600 });
  for (let i = 0; i < 120 * 300 && l.status === 'flying'; i++) {
    guidance(l, 200);
    l.step(1 / 120);
  }
  assert.equal(l.status, 'landed', l.reason);
});

test('Mars atmosphere: surface density ~0.015–0.02 kg/m³', () => {
  const a = marsAtmosphere(0);
  assert.ok(a.rho > 0.012 && a.rho < 0.022, a.rho);
  assert.ok(marsAtmosphere(40000).rho < a.rho / 20);
});

test('Perseverance-like entry reaches a parachute window near 11 km at Mach ~1.7', () => {
  const sim = new EntrySim(perseveranceDef());
  let deployed = null;
  for (let i = 0; i < 20 * 600 && sim.phase === 'entry'; i++) {
    sim.liftUp = sim.t < 80 ? 0.6 : 1;
    sim.step(0.05);
    if (sim.chuteWindow().ok && sim.mach < 1.8) {
      deployed = { alt: sim.alt, mach: sim.mach, t: sim.t };
      sim.deployChute();
    }
  }
  assert.ok(deployed, `no chute window; phase ${sim.phase} ${sim.reason} alt ${sim.alt}`);
  assert.ok(deployed.alt > 6000 && deployed.alt < 16000, JSON.stringify(deployed));
  assert.ok(sim.peak.g > 5 && sim.peak.g < 15, `peak g ${sim.peak.g}`);
});

export function perseveranceDef() {
  return {
    entry: { alt: 125000, v: 5420, gammaDeg: -15.5, mass: 3440 },
    aero: { cd: 1.65, area: Math.PI * 2.25 ** 2, ld: 0.24, noseRadius: 1.125 },
    chute: { cd: 0.62, area: Math.PI * 10.75 ** 2, maxMach: 2.2, minMach: 1.1, maxQ: 850, shieldSepDelay: 20, shieldMass: 440 },
    backshellAlt: 2100,
  };
}

test('Galileo lab: Io’s orbit gives Jupiter’s mass within 1%', () => {
  const M = keplerMass(421700e3, 1.769138 * DAY);
  assert.ok(Math.abs(M / MJUP - 1) < 0.01, M / MJUP);
});

test('51 Pegasi b minimum mass ≈ 0.46 Jupiter masses', () => {
  const m = rvMinMass(55.77, 4.2307966 * DAY, 1.11 * MSUN) / MJUP;
  assert.ok(m > 0.44 && m < 0.49, m);
});

test('GW150914: chirp mass of 36+29 Msun ≈ 28 Msun, and ḟ↔Mc round-trips', () => {
  const Mc = chirpMassOf(36, 29);
  assert.ok(Math.abs(Mc - 28.1) < 0.3, Mc);
  const McKg = Mc * MSUN;
  const f1 = chirpFrequency(0.1, McKg), f2 = chirpFrequency(0.1 - 1e-4, McKg);
  const back = chirpMass((f1 + f2) / 2, (f2 - f1) / 1e-4) / MSUN;
  assert.ok(Math.abs(back - Mc) / Mc < 0.01, back);
});

test('M87*: a 42 µas shadow at 16.8 Mpc means ~6–7 billion Suns', () => {
  const M = blackHoleMassFromShadow(42, 16.8e6 * PC) / MSUN;
  assert.ok(M > 6e9 && M < 7.5e9, M.toExponential(2));
});

test('pulsar spin needs density above white-dwarf levels', () => {
  assert.ok(minDensityForSpin(1.3373) > 5e10);
});
