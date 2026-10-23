/**
 * LAUNCH WINDOW — orbital mission simulator (strict physics).
 *
 * Equations of motion in a non-rotating frame centred on `central` (Earth or Sun):
 *   a = −μc·r/|r|³                                      (central body)
 *     + Σ μp·[(rp − r)/|rp − r|³ − rp/|rp|³]             (other bodies, incl. the
 *                                                         "indirect" term because the
 *                                                         central body itself accelerates)
 *     + (F/m)·û  while an engine burns,  ṁ = −F/(Isp·g0)
 * Bodies follow real ephemerides (astronomy-engine). Integration is adaptive
 * DOPRI5. Manoeuvres are finite burns. The trajectory preview runs the exact
 * same model forward, so what you plan is what you fly.
 */
import { createDopri } from './ode.js';
import { createEphemeris } from './ephem.js';
import { MU, RADIUS, G0 } from './constants.js';
import { elements } from './orbit.js';
import { burnTime } from './ship.js';

const N = 5; // state: x, y, vx, vy, m

export function createOrbitalSim(def) {
  const epoch = new Date(def.epoch);
  const central = def.central;
  const perturbers = def.perturbers || [];
  const extra = def.extraBodies || []; // drawn/tracked, gravity included if in perturbers
  const ephem = createEphemeris({ center: central, bodies: [...new Set([...perturbers, ...extra])], epoch, span: def.span, step: def.ephemStep || (central === 'earth' ? 3 * 3600 : 86400) });
  const muC = MU[central];
  const pert = perturbers.map((b) => ({ name: b, mu: MU[b] }));
  const engine = { ...def.ship.engine };
  const dryMass = def.ship.dryMass;
  const tmp = { x: 0, y: 0, vx: 0, vy: 0 };

  // current burn (set by node execution): { mode, angle, ref, throttle }
  let burn = null;

  function refState(ref, t, o) {
    if (!ref || ref === central) {
      o.x = o.y = o.vx = o.vy = 0;
      return o;
    }
    return ephem.state(ref, t, o);
  }

  const refTmp = { x: 0, y: 0, vx: 0, vy: 0 };
  function thrustDir(t, y, b, out) {
    if (b.inertial) {
      const a = ((b.angle || 0) * Math.PI) / 180;
      out[0] = Math.cos(a);
      out[1] = Math.sin(a);
      return out;
    }
    refState(b.ref, t, refTmp);
    const rx = y[0] - refTmp.x, ry = y[1] - refTmp.y;
    const vx = y[2] - refTmp.vx, vy = y[3] - refTmp.vy;
    const vl = Math.hypot(vx, vy) || 1;
    const px = vx / vl, py = vy / vl;
    // in-plane perpendicular pointing away from the reference body
    let qx = -py, qy = px;
    if (qx * rx + qy * ry < 0) {
      qx = -qx;
      qy = -qy;
    }
    const a = ((b.angle || 0) * Math.PI) / 180;
    out[0] = Math.cos(a) * px + Math.sin(a) * qx;
    out[1] = Math.cos(a) * py + Math.sin(a) * qy;
    return out;
  }

  const dirTmp = [0, 0];
  const bTmp = { x: 0, y: 0, vx: 0, vy: 0 };
  function deriv(t, y, d) {
    const x = y[0], yy = y[1];
    const r2 = x * x + yy * yy;
    const r3 = r2 * Math.sqrt(r2);
    let ax = (-muC * x) / r3;
    let ay = (-muC * yy) / r3;
    for (let i = 0; i < pert.length; i++) {
      const p = pert[i];
      ephem.state(p.name, t, bTmp);
      const dx = bTmp.x - x, dy = bTmp.y - yy;
      const d2 = dx * dx + dy * dy;
      const d3 = d2 * Math.sqrt(d2);
      const b2 = bTmp.x * bTmp.x + bTmp.y * bTmp.y;
      const b3 = b2 * Math.sqrt(b2);
      ax += p.mu * (dx / d3 - bTmp.x / b3);
      ay += p.mu * (dy / d3 - bTmp.y / b3);
    }
    let mdot = 0;
    if (burn && y[4] > dryMass) {
      const F = engine.thrust * (burn.throttle ?? 1);
      thrustDir(t, y, burn, dirTmp);
      ax += (F / y[4]) * dirTmp[0];
      ay += (F / y[4]) * dirTmp[1];
      mdot = -F / (engine.isp * G0);
    }
    d[0] = y[2];
    d[1] = y[3];
    d[2] = ax;
    d[3] = ay;
    d[4] = mdot;
  }

  const posScale = central === 'sun' ? 1e3 : 1e-1; // absolute tolerance on position (m)
  const opts = { rtol: def.rtol ?? 1e-10, atol: [posScale, posScale, posScale * 1e-6, posScale * 1e-6, 1e-6], hmax: def.hmax ?? (central === 'sun' ? 2 * 86400 : 3600), h0: 10 };
  const integ = createDopri(deriv, N, opts);

  const s0 = def.state;
  const sim = {
    def,
    epoch,
    central,
    ephem,
    engine,
    dryMass,
    t: 0,
    y: [s0.x, s0.y, s0.vx, s0.vy, def.ship.wetMass],
    nodes: [], // planned manoeuvres
    log: [], // executed burns {t, dv, prop}
    status: 'flying', // flying | crashed | ended
    crashedInto: null,
    closest: {}, // body -> {d, t, vrel}
    entry: null, // entry-interface crossing record
    deliveredDv: 0,

    date(t = sim.t) {
      return new Date(epoch.getTime() + t * 1000);
    },
    get mass() {
      return sim.y[4];
    },
    get fuel() {
      return Math.max(0, sim.y[4] - dryMass);
    },
    dvLeft(m = sim.y[4]) {
      return engine.isp * G0 * Math.log(m / dryMass);
    },
    bodyState(name, t = sim.t, o = { x: 0, y: 0, vx: 0, vy: 0 }) {
      return refState(name, t, o);
    },
    /** State relative to a body. */
    rel(name, y = sim.y, t = sim.t) {
      const b = refState(name, t, { x: 0, y: 0, vx: 0, vy: 0 });
      return { x: y[0] - b.x, y: y[1] - b.y, vx: y[2] - b.vx, vy: y[3] - b.vy };
    },
    /** Two-body orbital elements relative to a body. */
    elementsAbout(name, y = sim.y, t = sim.t) {
      const r = sim.rel(name, y, t);
      return elements(r.x, r.y, r.vx, r.vy, MU[name]);
    },

    /** Add a manoeuvre node: { t (centre time), dv (m/s), angle (deg from prograde), ref (body) }. */
    addNode(node) {
      const n = { id: Math.random().toString(36).slice(2, 8), angle: 0, ref: central, ...node };
      sim.nodes.push(n);
      sim.nodes.sort((a, b) => a.t - b.t);
      return n;
    },
    removeNode(id) {
      sim.nodes = sim.nodes.filter((n) => n.id !== id);
    },
    clearNodes() {
      sim.nodes = [];
    },

    /** Coast (no burns) by dt seconds; dt may be negative (used by design tools). */
    coast(dt) {
      const ig = createDopri(deriv, N, opts);
      ig.reset(Math.sign(dt) * 10);
      burn = null;
      sim.t = ig.advance(sim.t, sim.y, dt);
      return sim;
    },
    /** Advance the real simulation by dt seconds (executes any burns on the way). */
    advance(dt) {
      const r = runSegmented(sim, sim.y, sim.t, dt, sim.nodes, integ, true);
      sim.t = r.t;
      return r;
    },

    /**
     * Predict the trajectory for `horizon` seconds with the current plan.
     * Returns sampled path (frame coords) and events. Uses an identical model.
     */
    predict(horizon, sampleDt) {
      // nothing to predict once the flight is over (inside the atmosphere or crashed)
      if (sim.status !== 'flying') return { path: [sim.y[0], sim.y[1], sim.t], closest: {}, entry: sim.entry || null, crashed: sim.status === 'crashed' ? sim.crashed || {} : null, burnsOut: [], final: sim.y.slice(), tEnd: sim.t };
      const y = sim.y.slice();
      const nodes = sim.nodes.map((n) => ({ ...n }));
      const pinteg = createDopri(deriv, N, opts);
      pinteg.reset(integ.h);
      const path = [];
      const ctx = { path, sampleDt: sampleDt || horizon / 600, nextSample: sim.t, closest: {}, entry: null, crashed: null, burnsOut: [] };
      const savedBurn = burn;
      burn = null;
      const r = runSegmented({ ...sim, closest: ctx.closest }, y, sim.t, horizon, nodes, pinteg, false, ctx);
      burn = savedBurn;
      ctx.final = y;
      ctx.tEnd = r.t;
      ctx.path.push(y[0], y[1], r.t);
      return ctx;
    },
  };

  /* ---------- segmented integration with finite burns and events ---------- */
  function runSegmented(owner, y, t, dt, nodes, ig, real, ctx) {
    const tEnd = t + dt;
    let crashed = null;
    const onStep = (tt, yy) => {
      if (ctx && tt >= ctx.nextSample) {
        ctx.path.push(yy[0], yy[1], tt);
        ctx.nextSample = tt + ctx.sampleDt;
      }
      const hit = trackEvents(owner, tt, yy, ctx);
      if (hit) {
        crashed = hit;
        return true;
      }
      return false;
    };
    let guard = 0;
    while (t < tEnd - 1e-9 && !crashed) {
      if (++guard > 10000) break;
      // next node event
      const node = nodes.find((n) => !n.done);
      let segEnd = tEnd;
      burn = null;
      if (node) {
        if (!node.started) {
          const m0 = y[4];
          const dv = Math.min(node.dv, engine.isp * G0 * Math.log(m0 / dryMass));
          node.dur = dv > 0 ? burnTime(dv, engine.isp, engine.thrust * (node.throttle ?? 1), m0) : 0;
          node.start = node.t - node.dur / 2;
          if (node.start <= t + 1e-9) {
            // start now (late start allowed if we're past the planned start)
            node.started = true;
            node.start = t;
            node.end = t + node.dur;
            node.m0 = m0;
            burn = { mode: 'node', angle: node.angle, ref: node.ref, inertial: node.inertial, throttle: node.throttle ?? 1 };
            ig.reset(Math.min(ig.h, Math.max(1, node.dur / 20)));
            segEnd = Math.min(tEnd, node.end);
          } else segEnd = Math.min(tEnd, node.start);
        } else {
          burn = { mode: 'node', angle: node.angle, ref: node.ref, inertial: node.inertial, throttle: node.throttle ?? 1 };
          segEnd = Math.min(tEnd, node.end);
        }
      }
      if (segEnd > t) t = ig.advance(t, y, segEnd - t, onStep);
      if (node && node.started && t >= node.end - 1e-9) {
        node.done = true;
        burn = null;
        const used = node.m0 - y[4];
        if (real) {
          owner.log.push({ t: node.start, dur: node.dur, dv: node.dv, prop: used, ref: node.ref, angle: node.angle });
          owner.deliveredDv += engine.isp * G0 * Math.log(node.m0 / y[4]);
          owner.nodes = owner.nodes.filter((n) => n !== node);
        } else ctx?.burnsOut.push({ start: node.start, end: node.end, x: y[0], y: y[1] });
        ig.reset(10);
      }
    }
    if (!node0Active(nodes)) burn = null;
    if (crashed) {
      if (real) {
        owner.status = crashed === 'entry' ? 'entered' : 'crashed';
        owner.crashedInto = crashed;
      } else if (ctx) ctx.crashed = { body: crashed, t };
    }
    return { t, crashed };
  }
  function node0Active(nodes) {
    return nodes.some((n) => n.started && !n.done);
  }

  const evTmp = { x: 0, y: 0, vx: 0, vy: 0 };
  const tracked = [central, ...new Set([...perturbers, ...extra])].filter((b) => RADIUS[b]);
  /**
   * Closest approach between integration steps, to second order: the relative
   * motion r(τ) = r + v·τ + ½·a·τ² (a = the body's gravity) is minimised with
   * Newton's method on r(τ)·v(τ) = 0 for τ within the last step.
   */
  function refineMin(dx, dy, dvx, dvy, mu, hBack) {
    const r = Math.hypot(dx, dy);
    const k = -mu / (r * r * r);
    const ax = k * dx, ay = k * dy;
    let tau = -(dx * dvx + dy * dvy) / (dvx * dvx + dvy * dvy || 1);
    for (let i = 0; i < 8; i++) {
      const rx = dx + dvx * tau + 0.5 * ax * tau * tau, ry = dy + dvy * tau + 0.5 * ay * tau * tau;
      const vx = dvx + ax * tau, vy = dvy + ay * tau;
      const f = rx * vx + ry * vy;
      const fp = vx * vx + vy * vy + rx * ax + ry * ay;
      if (!fp) break;
      tau -= f / fp;
    }
    if (!(tau <= 0 && tau >= -hBack * 1.05)) return null;
    const rx = dx + dvx * tau + 0.5 * ax * tau * tau, ry = dy + dvy * tau + 0.5 * ay * tau * tau;
    return { d: Math.hypot(rx, ry), tau };
  }
  function trackEvents(owner, t, y, ctx) {
    const closest = ctx ? ctx.closest : owner.closest;
    const last = ctx ? (ctx._last ||= {}) : (owner._last ||= {});
    for (const b of tracked) {
      refState(b, t, evTmp);
      const dx = y[0] - evTmp.x, dy = y[1] - evTmp.y;
      const dvx = y[2] - evTmp.vx, dvy = y[3] - evTmp.vy;
      let d = Math.hypot(dx, dy);
      let tc = t;
      const dot = dx * dvx + dy * dvy;
      const prev = last[b];
      if (prev && prev.dot < 0 && dot >= 0) {
        // a periapsis happened during this step: find it precisely
        const m = refineMin(dx, dy, dvx, dvy, MU[b], t - prev.t);
        if (m && m.d < d) {
          d = m.d;
          tc = t + m.tau;
        }
      }
      last[b] = { dot, t };
      const c = closest[b];
      if (!c || d < c.d) closest[b] = { d, t: tc, vrel: Math.hypot(dvx, dvy), x: y[0], y: y[1] };
      if (d < RADIUS[b] && Math.hypot(dx, dy) >= RADIUS[b] && !(ctx ? ctx.crashed : owner.status !== 'flying')) {
        // grazed below the surface between steps
        return b;
      }
      if (d < RADIUS[b]) return b;
      // entry interface (e.g. Earth at 121.92 km)
      const ei = def.entryInterface;
      if (ei && b === ei.body && d < RADIUS[b] + ei.altitude) {
        const rec = ctx ? ctx.entry : owner.entry;
        if (!rec) {
          const el = elements(dx, dy, y[2] - evTmp.vx, y[3] - evTmp.vy, MU[b]);
          const entry = { t, gamma: (el.gamma * 180) / Math.PI, v: el.v, x: y[0], y: y[1] };
          if (ctx) ctx.entry = entry;
          else owner.entry = entry;
          if (ei.stop) return 'entry';
        }
      }
    }
    return null;
  }

  return sim;
}
