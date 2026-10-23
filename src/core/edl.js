/**
 * Mars entry, descent and landing (EDL) — the "seven minutes of terror".
 *
 * Planar entry over a spherical, non-rotating Mars:
 *   ṙ = v sin γ
 *   φ̇ = v cos γ / r                                  (downrange angle)
 *   v̇ = −D/m − g sin γ
 *   γ̇ = (L·cos σ)/(m v) − (g/v − v/r) cos γ
 *   D = ½ ρ v² Cd A,  L = (L/D)·D,  g = μ/r²
 * σ is the bank angle: the capsule rolls its lift vector up (cos σ = 1) or down
 * (cos σ = −1) to stretch or shorten its flight. That is how Curiosity and
 * Perseverance flew guided entries.
 * Atmosphere: NASA Glenn Research Center "Mars atmosphere model".
 */
import { MU, RADIUS } from './constants.js';

const R_GAS = 192.1; // J/(kg·K) as used in the NASA Glenn model
const GAMMA_CO2 = 1.29;

/** NASA Glenn Mars atmosphere: returns {T (K), p (Pa), rho (kg/m³), a (m/s)}. */
export function marsAtmosphere(h) {
  let Tc = h > 7000 ? -23.4 - 0.00222 * h : -31 - 0.000998 * h;
  let T = Tc + 273.15;
  if (T < 130) T = 130; // the simple model isn't valid that high; hold a realistic upper-atmosphere temperature
  const p = 0.699 * Math.exp(-0.00009 * h) * 1000;
  const rho = p / (R_GAS * T);
  return { T, p, rho, a: Math.sqrt(GAMMA_CO2 * R_GAS * T) };
}

/** Sutton–Graves stagnation-point heating for CO₂ atmospheres (W/m²). */
export function heatFlux(rho, v, noseRadius) {
  return 1.9027e-4 * Math.sqrt(rho / noseRadius) * v ** 3;
}

export class EntrySim {
  /**
   * def: { entry:{alt, v, gammaDeg, mass}, aero:{cd, area, ld, noseRadius},
   *        chute:{cd, area, maxMach, minMach, maxQ, shieldSepDelay, shieldMass},
   *        backshellAlt, target (downrange m) }
   */
  constructor(def) {
    this.def = def;
    this.mu = MU.mars;
    this.R = RADIUS.mars;
    const e = def.entry;
    this.s = { r: this.R + e.alt, phi: 0, v: e.v, gamma: (e.gammaDeg * Math.PI) / 180, m: e.mass };
    this.t = 0;
    this.liftUp = 1; // cos σ commanded by the player
    this.phase = 'entry'; // entry | chute | handover | failed
    this.reason = null;
    this.peak = { g: 0, heat: 0, q: 0 };
    this.chuteAt = null;
    this.shieldOff = false;
  }
  get alt() {
    return this.s.r - this.R;
  }
  get downrange() {
    return this.s.phi * this.R;
  }
  atm() {
    return marsAtmosphere(Math.max(0, this.alt));
  }
  get mach() {
    return this.s.v / this.atm().a;
  }
  get q() {
    return 0.5 * this.atm().rho * this.s.v ** 2;
  }
  _cdA() {
    const a = this.def.aero;
    if (this.phase === 'chute') return this.def.chute.cd * this.def.chute.area + (this.shieldOff ? 0 : a.cd * a.area);
    return a.cd * a.area;
  }
  _deriv(s, out) {
    const h = s.r - this.R;
    const { rho } = marsAtmosphere(Math.max(0, h));
    const D = 0.5 * rho * s.v * s.v * this._cdA();
    const L = this.phase === 'entry' ? this.def.aero.ld * 0.5 * rho * s.v * s.v * this.def.aero.cd * this.def.aero.area : 0;
    const g = this.mu / (s.r * s.r);
    out.r = s.v * Math.sin(s.gamma);
    out.phi = (s.v * Math.cos(s.gamma)) / s.r;
    out.v = -D / s.m - g * Math.sin(s.gamma);
    out.gamma = (L * this.liftUp) / (s.m * s.v) - (g / s.v - s.v / s.r) * Math.cos(s.gamma);
    out.decel = D / s.m;
  }
  step(dt) {
    if (this.phase !== 'entry' && this.phase !== 'chute') return this.phase;
    // RK4 on the 4-state system
    const s = this.s;
    const k = [{}, {}, {}, {}];
    const tmp = { r: 0, phi: 0, v: 0, gamma: 0, m: s.m };
    const add = (src, d, f) => {
      tmp.r = src.r + d.r * f;
      tmp.phi = src.phi + d.phi * f;
      tmp.v = src.v + d.v * f;
      tmp.gamma = src.gamma + d.gamma * f;
      return tmp;
    };
    this._deriv(s, k[0]);
    this._deriv(add(s, k[0], dt / 2), k[1]);
    this._deriv(add(s, k[1], dt / 2), k[2]);
    this._deriv(add(s, k[2], dt), k[3]);
    for (const key of ['r', 'phi', 'v', 'gamma']) s[key] += (dt / 6) * (k[0][key] + 2 * k[1][key] + 2 * k[2][key] + k[3][key]);
    this.t += dt;
    const a = this.atm();
    const q = 0.5 * a.rho * s.v * s.v;
    const heat = heatFlux(a.rho, s.v, this.def.aero.noseRadius);
    this.peak.g = Math.max(this.peak.g, k[0].decel / 9.80665);
    this.peak.heat = Math.max(this.peak.heat, heat);
    this.peak.q = Math.max(this.peak.q, q);
    // heat shield separation after the parachute has slowed the capsule
    if (this.phase === 'chute' && !this.shieldOff && this.t - this.chuteAt >= this.def.chute.shieldSepDelay) {
      this.shieldOff = true;
      s.m -= this.def.chute.shieldMass;
    }
    if (this.alt <= 0) {
      this.phase = 'failed';
      this.reason = 'impact';
    } else if (this.phase === 'chute' && this.alt <= this.def.backshellAlt) this.phase = 'handover';
    else if (this.phase === 'entry' && s.v < 250 && this.alt < 8000) {
      this.phase = 'failed';
      this.reason = 'noChute'; // too slow and too low without a parachute
    }
    return this.phase;
  }
  /** Can the parachute be deployed right now? Returns {ok, why}. */
  chuteWindow() {
    const c = this.def.chute;
    const m = this.mach;
    if (m > c.maxMach) return { ok: false, why: 'tooFast' };
    if (this.q > c.maxQ) return { ok: false, why: 'tooMuchPressure' };
    if (m < c.minMach) return { ok: false, why: 'tooSlow' };
    return { ok: true };
  }
  deployChute() {
    if (this.phase !== 'entry') return false;
    const w = this.chuteWindow();
    if (!w.ok) {
      if (w.why !== 'tooSlow') {
        this.phase = 'failed';
        this.reason = 'chuteTorn';
      }
      return false;
    }
    this.phase = 'chute';
    this.chuteAt = this.t;
    return true;
  }
  /** Velocity components (horizontal, vertical) for handing over to the lander. */
  handoverState() {
    return { vx: this.s.v * Math.cos(this.s.gamma), vz: this.s.v * Math.sin(this.s.gamma), alt: this.alt, downrange: this.downrange, mass: this.s.m };
  }
}
