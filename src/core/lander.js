/**
 * Powered-descent lander (Apollo LM, Vikram, Mars 2020 descent stage).
 *
 * 2D rigid-body point model over local terrain:
 *   ẍ = (T/m)·sin θ,   z̈ = (T/m)·cos θ − g,   ṁ = −T/(Isp·g0)
 * θ is the thrust tilt from vertical, changed by attitude thrusters at a
 * limited rate. T is limited by the real engine's throttle range. Touchdown
 * is judged against each lander's real design limits. Over the last few
 * kilometres the surface is effectively flat; planetary rotation is ignored.
 */
import { G0 } from './constants.js';
import { rk4Step, rk4Scratch } from './ode.js';

const N = 5; // x, z, vx, vz, m

export function terrainHeight(terrain, x) {
  let h = terrain.base ?? 0;
  for (const c of terrain.craters || []) {
    const d = Math.abs(x - c.x);
    if (d < c.r) h -= c.depth * (1 - (d / c.r) ** 2);
    else if (d < c.r * 1.25) h += c.rim * (1 - (d - c.r) / (c.r * 0.25));
  }
  for (const s of terrain.slopes || []) if (x >= s.x0 && x <= s.x1) h += (x - s.x0) * s.grade;
  return h;
}

export function boulderAt(terrain, x, halfWidth = 2) {
  return (terrain.boulders || []).find((b) => Math.abs(x - b.x) < b.r + halfWidth) || null;
}

export function slopeAt(terrain, x) {
  return (terrainHeight(terrain, x + 1) - terrainHeight(terrain, x - 1)) / 2;
}

export class Lander {
  /**
   * def: { g, engine:{thrust, isp, minThrottle}, dryMass, mass, x, z, vx, vz,
   *        pitchRate (deg/s), maxPitch (deg), limits:{vz, vx, tilt}, terrain, footprint }
   */
  constructor(def) {
    this.def = def;
    this.g = def.g;
    this.engine = def.engine;
    this.dryMass = def.dryMass;
    this.y = [def.x ?? 0, def.z, def.vx ?? 0, def.vz ?? 0, def.mass];
    this.t = 0;
    this.pitch = ((def.pitch ?? 0) * Math.PI) / 180;
    this.pitchCmd = this.pitch;
    this.throttleCmd = def.throttle ?? 0;
    this.status = 'flying'; // flying | landed | crashed
    this.reason = null;
    this.tmp = rk4Scratch(N);
    this.fuelStart = def.mass - def.dryMass;
    this.minAlt = Infinity;
    this.deriv = this.deriv.bind(this);
  }
  get x() {
    return this.y[0];
  }
  get z() {
    return this.y[1];
  }
  get vx() {
    return this.y[2];
  }
  get vz() {
    return this.y[3];
  }
  get mass() {
    return this.y[4];
  }
  get fuel() {
    return Math.max(0, this.y[4] - this.dryMass);
  }
  get altitude() {
    return this.y[1] - terrainHeight(this.def.terrain, this.y[0]);
  }
  /** Actual thrust after throttle limits (engine can't run below minThrottle). */
  thrust() {
    if (this.fuel <= 0) return 0;
    let th = Math.max(0, Math.min(1, this.throttleCmd));
    if (th > 0 && th < (this.engine.minThrottle ?? 0)) th = this.engine.minThrottle;
    return th * this.engine.thrust;
  }
  /** Propellant burn rate needed to hover (kg/s). */
  hoverBurnRate() {
    return (this.mass * this.g) / (this.engine.isp * G0);
  }
  /** Seconds of hover fuel left above a reserve (kg). */
  hoverSecondsLeft(reserve = 0) {
    return Math.max(0, (this.fuel - reserve) / this.hoverBurnRate());
  }
  deriv(t, y, d) {
    const T = this._T;
    const m = y[4];
    d[0] = y[2];
    d[1] = y[3];
    d[2] = (T / m) * Math.sin(this.pitch);
    d[3] = (T / m) * Math.cos(this.pitch) - this.g;
    d[4] = T > 0 ? -T / (this.engine.isp * G0) : 0;
  }
  step(dt) {
    if (this.status !== 'flying') return this.status;
    // attitude: rate-limited slew toward the command
    const maxStep = ((this.def.pitchRate ?? 10) * Math.PI) / 180 * dt;
    const lim = ((this.def.maxPitch ?? 60) * Math.PI) / 180;
    const cmd = Math.max(-lim, Math.min(lim, this.pitchCmd));
    this.pitch += Math.max(-maxStep, Math.min(maxStep, cmd - this.pitch));
    this._T = this.thrust();
    rk4Step(this.deriv, this.t, this.y, dt, N, this.tmp);
    if (this.y[4] < this.dryMass) this.y[4] = this.dryMass;
    this.t += dt;
    const alt = this.altitude;
    this.minAlt = Math.min(this.minAlt, alt);
    if (alt <= 0) this.touchdown();
    return this.status;
  }
  touchdown() {
    const L = this.def.limits;
    const terr = this.def.terrain;
    const x = this.y[0];
    this.y[1] = terrainHeight(terr, x);
    const tilt = Math.abs((this.pitch * 180) / Math.PI);
    const slope = Math.abs((Math.atan(slopeAt(terr, x)) * 180) / Math.PI);
    const rock = boulderAt(terr, x, this.def.footprint ?? 2);
    this.touch = { vz: -this.y[3], vx: Math.abs(this.y[2]), tilt, slope, x, rock: !!rock };
    let reason = null;
    if (rock) reason = 'boulder';
    else if (-this.y[3] > L.vz) reason = 'tooFast';
    else if (Math.abs(this.y[2]) > L.vx) reason = 'sideways';
    else if (tilt + slope > L.tilt) reason = 'tipped';
    this.status = reason ? 'crashed' : 'landed';
    this.reason = reason;
    this.y[2] = this.y[3] = 0;
    return this.status;
  }
}

/**
 * Landing guidance (used by "Mission Assist" and by the solver that proves
 * each landing is possible). Like real landing software it never asks for a
 * descent rate the engine couldn't stop in time: the sink rate is limited to
 * √(2·k·a_net·h), where a_net is the braking the engine can really deliver.
 * It translates to the target first, then descends vertically.
 */
export function guidance(l, targetX, opts = {}) {
  const alt = l.altitude;
  const g = l.g;
  const dx = targetX - l.x;
  const aNet = Math.max(0.05, l.engine.thrust / l.mass - g); // best braking available
  // horizontal: fly toward the target, arriving with zero sideways speed
  const vxMax = Math.min(opts.vxMax ?? 20, Math.sqrt(2 * 0.5 * aNet * Math.abs(dx)));
  const vxDes = Math.abs(dx) < 0.5 ? 0 : Math.sign(dx) * Math.min(vxMax, Math.abs(dx) * (opts.kx ?? 0.15));
  const axDes = (vxDes - l.vx) * (opts.kv ?? 0.5);
  // vertical: hold a safe height until over the target, then descend
  const holdAlt = opts.holdAlt ?? 15;
  const far = Math.abs(dx) > (opts.overTarget ?? 3) || Math.abs(l.vx) > 1.5;
  let vzDes;
  if (far && alt < holdAlt * 1.5) vzDes = (holdAlt - alt) * 0.4;
  else {
    const safe = Math.sqrt(2 * (opts.brakeMargin ?? 0.45) * aNet * Math.max(0, alt - 1));
    vzDes = -Math.max(opts.vzMin ?? 0.8, Math.min(opts.vzMax ?? 30, alt * (opts.kz ?? 0.15), safe));
  }
  const azDes = Math.max(0.05 * g, (vzDes - l.vz) * (opts.kvz ?? 1.5) + g);
  let pitch = Math.atan2(axDes, azDes);
  const maxTilt = ((opts.maxTilt ?? 30) * Math.PI) / 180;
  if (alt < 3) pitch *= Math.max(0, alt / 3);
  const clipped = Math.abs(pitch) > maxTilt;
  pitch = Math.max(-maxTilt, Math.min(maxTilt, pitch));
  // if the tilt was limited, size the thrust to the vertical need (never climb by accident)
  const T = clipped ? (l.mass * azDes) / Math.cos(pitch) / l.engine.thrust : (l.mass * Math.hypot(axDes, azDes)) / l.engine.thrust;
  l.pitchCmd = pitch;
  l.throttleCmd = Math.max(0, Math.min(1, T));
}
