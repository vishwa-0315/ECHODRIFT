/**
 * Landing missions (Apollo 11, Vikram) and the Mars EDL mission (Perseverance).
 */
import { Lander, guidance, terrainHeight, boulderAt, slopeAt } from '../core/lander.js';
import { EntrySim } from '../core/edl.js';

export function buildLander(m, override = {}) {
  const P = m.physics;
  const L = override.lander || P;
  const start = override.start || P.start || {};
  const lander = new Lander({
    g: L.g,
    engine: { thrust: L.engine.thrust * (L.engine.maxThrottle ?? 1), isp: L.engine.isp, minThrottle: (L.engine.minThrottle ?? 0) / (L.engine.maxThrottle ?? 1) },
    dryMass: L.dryMass,
    mass: override.mass ?? L.mass,
    x: start.x ?? 0,
    z: start.z,
    vx: start.vx ?? 0,
    vz: start.vz ?? 0,
    pitch: start.pitch ?? 0,
    pitchRate: L.pitchRate,
    maxPitch: L.maxPitch,
    limits: L.limits,
    terrain: L.terrain,
    footprint: L.footprint,
  });
  return lander;
}

/** Is x a safe landing point (flat, no boulders)? */
export function isSafe(terrain, x, footprint = 2.5, maxSlopeDeg = 8) {
  if (boulderAt(terrain, x, footprint)) return false;
  for (const dx of [-footprint, 0, footprint]) {
    if (Math.abs((Math.atan(slopeAt(terrain, x + dx)) * 180) / Math.PI) > maxSlopeDeg) return false;
  }
  return true;
}

/** Find the nearest safe point to x (Mission Assist's "hazard detection"). */
export function nearestSafe(terrain, x, footprint, range = 400) {
  for (let d = 0; d < range; d += 1) {
    if (isSafe(terrain, x + d, footprint)) return x + d;
    if (isSafe(terrain, x - d, footprint)) return x - d;
  }
  return x;
}

/** Fly a lander to the ground with guidance (used by the solver and by "Mission Assist: autoland"). */
export function autoland(l, targetX, opts = {}) {
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 600 && l.status === 'flying'; i++) {
    guidance(l, targetX, opts);
    l.step(dt);
  }
  return l.status;
}

/** Mars EDL. */
export function buildEntry(m) {
  return new EntrySim(m.physics);
}

/**
 * Entry guidance (Mission Assist): a numerical predictor–corrector, the idea
 * behind the real MSL/Mars 2020 entry guidance. It predicts where the capsule
 * will be when the parachute opens for a constant lift setting and picks the
 * setting that lands on target. Returns the lift fraction (cos σ) to fly now.
 */
export function entryGuidance(sim, targetDownrange) {
  const predict = (liftUp) => predictHandover(sim, liftUp, 1.8);
  // range grows with lift-up; bisection on liftUp ∈ [−1, 1]
  let lo = -1, hi = 1;
  const rLo = predict(lo), rHi = predict(hi);
  if (targetDownrange <= rLo) return -1;
  if (targetDownrange >= rHi) return 1;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (predict(mid) < targetDownrange) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Predict the downrange distance at backshell separation if we keep the given
 * lift setting and open the chute at the first safe moment below `chuteMach`
 * (or right now if `deployNow`).
 */
export function predictHandover(sim, liftUp, chuteMach = 1.8, deployNow = false) {
  const c = new EntrySim(sim.def);
  c.s = { ...sim.s };
  c.t = sim.t;
  c.phase = sim.phase;
  c.chuteAt = sim.chuteAt;
  c.shieldOff = sim.shieldOff;
  c.liftUp = liftUp;
  if (deployNow && c.phase === 'entry') c.deployChute();
  for (let i = 0; i < 6000 && (c.phase === 'entry' || c.phase === 'chute'); i++) {
    c.step(0.25);
    if (c.phase === 'entry' && c.mach < chuteMach && c.chuteWindow().ok) c.deployChute();
  }
  return c.phase === 'handover' ? c.downrange : -1e9;
}

/**
 * Range trigger (as flown by Mars 2020): open the parachute when doing so now
 * would bring the capsule down on target, or when the safe window is closing.
 */
export function rangeTrigger(sim, targetDownrange) {
  const w = sim.chuteWindow();
  if (!w.ok) return false;
  if (sim.mach < 1.25) return true; // last chance before the window closes
  return predictHandover(sim, sim.liftUp, 1.8, true) >= targetDownrange;
}

export { terrainHeight };
