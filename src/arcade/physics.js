/**
 * Arcade-mode flight physics. Same laws as Expert mode, set up for short levels:
 *
 *  - A central body (Earth, Mars or the Sun) at the origin, other bodies (Moon,
 *    Jupiter, Saturn…) on circular orbits with their real radius and real
 *    period (ω = √(G(M+m)/a³)). The ship feels Newtonian gravity from all of
 *    them, plus the "indirect" term because the central body itself is pulled
 *    by the others (restricted n-body problem, exact for this setup).
 *  - Finite engine burns: thrust F, mass flow ṁ = F/(Isp·g₀): the rocket
 *    equation emerges by itself.
 *  - Adaptive Dormand–Prince integration, so close flybys are accurate.
 *
 * The only arcade liberty is time: the clock runs fast far from planets and
 * slows down near them, where the action is.
 */
import { createDopri, rk4Step, rk4Scratch } from '../core/ode.js';
import { G0 } from '../core/constants.js';

export function circularBody(b) {
  const w = (b.retro ? -1 : 1) * Math.sqrt((b.muCentral + b.mu) / b.a ** 3);
  return { ...b, w };
}

export function bodyState(b, t, out = {}) {
  const ang = (b.phase0 ?? 0) + b.w * t;
  const c = Math.cos(ang), s = Math.sin(ang);
  out.x = b.a * c;
  out.y = b.a * s;
  out.vx = -b.a * b.w * s;
  out.vy = b.a * b.w * c;
  return out;
}

/**
 * def: { central:{name, mu, R}, bodies:[{name, mu, R, a, phase0}], ship:{x,y,vx,vy, mass, dry, thrust, isp},
 *        hitRadius?: {name: r} (radius that counts as reaching the atmosphere/surface) }
 */
export function createWorld(def) {
  const central = def.central;
  const bodies = (def.bodies || []).map((b) => circularBody({ ...b, muCentral: central.mu }));
  const tmp = {};
  const w = {
    t: 0,
    y: [def.ship.x, def.ship.y, def.ship.vx, def.ship.vy, def.ship.mass],
    dry: def.ship.dry,
    thrust: def.ship.thrust,
    isp: def.ship.isp,
    central,
    bodies,
    burn: null, // { dir: 'pro'|'retro'|'out'|'in'|angle, ref: bodyName|null }
    status: 'flying',
    hit: null,
    dvUsed: 0,
    get fuel() {
      return Math.max(0, w.y[4] - w.dry);
    },
    get fuel0() {
      return def.ship.mass - def.ship.dry;
    },
    body(name) {
      return bodies.find((b) => b.name === name);
    },
    bodyAt(name, t = w.t) {
      if (name === central.name) return { x: 0, y: 0, vx: 0, vy: 0 };
      return bodyState(w.body(name), t, {});
    },
    /** Ship position/velocity relative to a body. */
    rel(name, y = w.y, t = w.t) {
      const b = w.bodyAt(name, t);
      return { x: y[0] - b.x, y: y[1] - b.y, vx: y[2] - b.vx, vy: y[3] - b.vy };
    },
  };

  function thrustDir(t, y) {
    const br = w.burn;
    let vx = y[2], vy = y[3], rx = y[0], ry = y[1];
    if (br.ref && br.ref !== central.name) {
      const b = bodyState(w.body(br.ref), t, tmp);
      vx -= b.vx;
      vy -= b.vy;
      rx -= b.x;
      ry -= b.y;
    }
    if (typeof br.dir === 'number') return [Math.cos(br.dir), Math.sin(br.dir)];
    const v = Math.hypot(vx, vy) || 1, r = Math.hypot(rx, ry) || 1;
    switch (br.dir) {
      case 'pro':
        return [vx / v, vy / v];
      case 'retro':
        return [-vx / v, -vy / v];
      case 'out':
        return [rx / r, ry / r];
      case 'in':
        return [-rx / r, -ry / r];
      default:
        return [0, 0];
    }
  }

  function deriv(t, y, d) {
    const x = y[0], yy = y[1];
    const r2 = x * x + yy * yy, r = Math.sqrt(r2);
    let ax = (-central.mu * x) / (r2 * r), ay = (-central.mu * yy) / (r2 * r);
    for (const b of bodies) {
      if (!b.mu) continue; // marker only (its gravity is negligible on this trip)
      const p = bodyState(b, t, tmp);
      const dx = x - p.x, dy = yy - p.y;
      const d2 = dx * dx + dy * dy, dd = Math.sqrt(d2);
      const rb = Math.hypot(p.x, p.y);
      ax += -b.mu * (dx / (d2 * dd) + p.x / rb ** 3);
      ay += -b.mu * (dy / (d2 * dd) + p.y / rb ** 3);
    }
    d[0] = y[2];
    d[1] = y[3];
    d[4] = 0;
    if (w.burn && y[4] > w.dry) {
      const [ux, uy] = thrustDir(t, y);
      const a = w.thrust / y[4];
      ax += a * ux;
      ay += a * uy;
      d[4] = -w.thrust / (w.isp * G0);
    }
    d[2] = ax;
    d[3] = ay;
  }

  const integ = createDopri(deriv, 5, { rtol: 1e-9, atol: [1, 1, 1e-3, 1e-3, 1e-3], hmax: def.hmax ?? 3600 });
  integ.reset(10);

  /** Collision radius per body (surface, or the top of the atmosphere for re-entry). */
  const hitR = (name, R) => def.hitRadius?.[name] ?? R;

  function collided(t, y) {
    const r = Math.hypot(y[0], y[1]);
    if (r < hitR(central.name, central.R)) return central.name;
    for (const b of bodies) {
      if (!b.mu) continue;
      const p = bodyState(b, t, tmp);
      if (Math.hypot(y[0] - p.x, y[1] - p.y) < hitR(b.name, b.R)) return b.name;
    }
    return null;
  }

  /**
   * A step ended inside a body: step again from the last state outside it in
   * small RK4 steps to find the exact moment of contact (so entry angles and
   * crash points are precise, whatever the integrator's step size was).
   */
  const scratch = rk4Scratch(5);
  function refineHit(t0, y0, t1, y) {
    const n = 400, h = (t1 - t0) / n;
    const yy = y0.slice();
    let t = t0;
    for (let i = 0; i < n; i++) {
      rk4Step(deriv, t, yy, h, 5, scratch);
      t += h;
      if (collided(t, yy)) {
        for (let k = 0; k < 5; k++) y[k] = yy[k];
        return t;
      }
    }
    return t1;
  }

  /** Advance dt simulated seconds (the engine burns while w.burn is set and fuel remains). */
  w.advance = (dt) => {
    if (w.status !== 'flying' || dt <= 0) return;
    const m0 = w.y[4];
    let hitBody = null;
    let pt = w.t, py = w.y.slice();
    integ.advance(w.t, w.y, dt, (t, y) => {
      const c = collided(t, y);
      if (c) {
        hitBody = c;
        w.t = refineHit(pt, py, t, y);
        return true;
      }
      pt = t;
      py = y.slice();
      return false;
    });
    if (!hitBody) w.t += dt;
    if (w.y[4] < w.dry) w.y[4] = w.dry;
    if (w.y[4] < m0) w.dvUsed += w.isp * G0 * Math.log(m0 / w.y[4]);
    if (hitBody) {
      w.status = 'hit';
      w.hit = hitBody;
    }
  };

  /**
   * Coast prediction (no burns) for `horizon` seconds: returns sampled path,
   * closest approach to each body and whether/where it hits something.
   */
  w.predict = (horizon, samples = 240) => {
    const y = w.y.slice();
    const saved = w.burn;
    w.burn = null;
    const p = createDopri(deriv, 5, { rtol: 1e-8, atol: [10, 10, 1e-2, 1e-2, 1e-2], hmax: def.hmax ?? 3600 });
    p.reset(integ.h || 10);
    const path = [];
    const closest = {};
    let hit = null;
    const dtS = horizon / samples;
    let t = w.t;
    let nextS = t;
    let pt = t, py = y.slice();
    p.advance(t, y, horizon, (tt, yy) => {
      for (const b of bodies) {
        const q = bodyState(b, tt, tmp);
        const d = Math.hypot(yy[0] - q.x, yy[1] - q.y);
        if (!closest[b.name] || d < closest[b.name].d) closest[b.name] = { d, t: tt, x: yy[0], y: yy[1], vx: yy[2] - q.vx, vy: yy[3] - q.vy, rx: yy[0] - q.x, ry: yy[1] - q.y };
      }
      const dc = Math.hypot(yy[0], yy[1]);
      if (!closest[central.name] || dc < closest[central.name].d) closest[central.name] = { d: dc, t: tt, x: yy[0], y: yy[1], vx: yy[2], vy: yy[3], rx: yy[0], ry: yy[1] };
      if (tt >= nextS) {
        path.push(yy[0], yy[1], tt);
        nextS = tt + dtS;
      }
      const c = collided(tt, yy);
      if (c) {
        const th = refineHit(pt, py, tt, yy);
        hit = { body: c, t: th, x: yy[0], y: yy[1], vx: yy[2], vy: yy[3] };
        path.push(yy[0], yy[1], th);
        return true;
      }
      if (!c) {
        pt = tt;
        py = yy.slice();
      }
      return false;
    });
    w.burn = saved;
    return { path, closest, hit, end: y };
  };

  /** Osculating orbit about a body: e, a, peri/apo distances, energy. */
  w.orbitAbout = (name, y = w.y, t = w.t) => {
    const mu = name === central.name ? central.mu : w.body(name).mu;
    const r = name === central.name ? { x: y[0], y: y[1], vx: y[2], vy: y[3] } : w.rel(name, y, t);
    const rr = Math.hypot(r.x, r.y), v2 = r.vx ** 2 + r.vy ** 2;
    const energy = v2 / 2 - mu / rr;
    const hz = r.x * r.vy - r.y * r.vx;
    const ex = ((v2 - mu / rr) * r.x - (r.x * r.vx + r.y * r.vy) * r.vx) / mu;
    const ey = ((v2 - mu / rr) * r.y - (r.x * r.vx + r.y * r.vy) * r.vy) / mu;
    const e = Math.hypot(ex, ey);
    const p = (hz * hz) / mu;
    const peri = p / (1 + e);
    const apo = e < 1 ? p / (1 - e) : Infinity;
    const a = energy < 0 ? -mu / (2 * energy) : Infinity;
    return { r: rr, v: Math.sqrt(v2), energy, e, peri, apo, a, h: hz, period: energy < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity, nuCos: e > 1e-9 ? (ex * r.x + ey * r.y) / (e * rr) : 1, radialV: (r.x * r.vx + r.y * r.vy) / rr };
  };

  return w;
}
