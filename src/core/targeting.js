/**
 * Targeting tools — the same maths real flight-dynamics teams use to design
 * burns. They power "Mission Assist" and the solvers that prove every mission
 * can be flown with the real spacecraft's fuel.
 */
import { MU, RADIUS } from './constants.js';

/** Secant/bisection root-finder on f(x) = 0 within [lo, hi]. */
export function solve1D(f, lo, hi, { tol = 1e-3, maxIter = 40 } = {}) {
  let flo = f(lo);
  let fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return null;
  if (flo * fhi > 0) return null;
  for (let i = 0; i < maxIter; i++) {
    // regula falsi with bisection fallback
    let x = hi - (fhi * (hi - lo)) / (fhi - flo);
    if (!(x > Math.min(lo, hi) && x < Math.max(lo, hi)) || i % 3 === 2) x = (lo + hi) / 2;
    const fx = f(x);
    if (!Number.isFinite(fx)) return null;
    if (Math.abs(fx) < tol || Math.abs(hi - lo) < 1e-9) return x;
    if (fx * flo < 0) {
      hi = x;
      fhi = fx;
    } else {
      lo = x;
      flo = fx;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Smallest |x| root of f, scanning outward from 0 in both directions with the
 * given step, then refining. Useful when f is only monotonic near the answer.
 */
export function smallestRoot(f, maxAbs, step, opts = {}) {
  const tol = opts.tol ?? 1e-3;
  const accept = (x) => x != null && Math.abs(f(x)) <= Math.max(tol * 20, 1e-9);
  const f0 = f(0);
  let prevP = 0, fp = f0, prevN = 0, fn = f0;
  for (let x = step; x <= maxAbs + 1e-12; x += step) {
    const a = f(x);
    if (Number.isFinite(a) && Number.isFinite(fp) && a * fp <= 0) {
      const r = solve1D(f, prevP, x, opts);
      if (accept(r)) return r;
    }
    prevP = x;
    fp = a;
    const b = f(-x);
    if (Number.isFinite(b) && Number.isFinite(fn) && b * fn <= 0) {
      const r = solve1D(f, -x, prevN, opts);
      if (accept(r)) return r;
    }
    prevN = -x;
    fn = b;
  }
  return null;
}

/** Golden-section minimiser of f on [a, b]. */
export function minimize1D(f, a, b, iters = 40) {
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** Nelder–Mead minimiser for small parameter vectors. */
export function nelderMead(f, x0, step, { iters = 200, tol = 1e-9 } = {}) {
  const n = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += step[i];
    pts.push(p);
  }
  let vals = pts.map(f);
  for (let k = 0; k < iters; k++) {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    pts = idx.map((i) => pts[i]);
    vals = idx.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) < tol) break;
    const cen = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += pts[i][j] / n;
    const refl = cen.map((c, j) => c + (c - pts[n][j]));
    const fr = f(refl);
    if (fr < vals[0]) {
      const exp = cen.map((c, j) => c + 2 * (c - pts[n][j]));
      const fe = f(exp);
      if (fe < fr) {
        pts[n] = exp;
        vals[n] = fe;
      } else {
        pts[n] = refl;
        vals[n] = fr;
      }
    } else if (fr < vals[n - 1]) {
      pts[n] = refl;
      vals[n] = fr;
    } else {
      const con = cen.map((c, j) => c + 0.5 * (pts[n][j] - c));
      const fcn = f(con);
      if (fcn < vals[n]) {
        pts[n] = con;
        vals[n] = fcn;
      } else {
        for (let i = 1; i <= n; i++) {
          pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j]));
          vals[i] = f(pts[i]);
        }
      }
    }
  }
  return { x: pts[0], f: vals[0] };
}

/**
 * Find the time of the next periapsis (closest point) about `body` within
 * `horizon` seconds, using the simulator's own prediction.
 */
export function nextPeriapsis(sim, body, horizon) {
  const pred = sim.predict(horizon, Math.min(600, horizon / 400));
  const p = pred.path;
  let best = null;
  let prevD = NaN;
  let falling = false;
  const b = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let i = 0; i < p.length; i += 3) {
    sim.bodyState(body, p[i + 2], b);
    const d = Math.hypot(p[i] - b.x, p[i + 1] - b.y);
    if (Number.isNaN(prevD)) {
      prevD = d;
      continue;
    }
    if (d < prevD) falling = true;
    else if (falling && d > prevD) {
      best = { t: p[i - 1], d: prevD };
      break;
    }
    prevD = d;
  }
  return best;
}

/** Time of the next apoapsis (farthest point) about `body` within `horizon`. */
export function nextApoapsis(sim, body, horizon) {
  const pred = sim.predict(horizon, Math.min(300, horizon / 600));
  const p = pred.path;
  const b = { x: 0, y: 0, vx: 0, vy: 0 };
  let prevD = NaN;
  let rising = false;
  for (let i = 0; i < p.length; i += 3) {
    sim.bodyState(body, p[i + 2], b);
    const d = Math.hypot(p[i] - b.x, p[i + 1] - b.y);
    if (Number.isNaN(prevD)) {
      prevD = d;
      continue;
    }
    if (d > prevD) rising = true;
    else if (rising && d < prevD) return { t: p[i - 1], d: prevD };
    prevD = d;
  }
  return null;
}

/** Altitude above a body from a distance. */
export const altOf = (body, d) => d - RADIUS[body];
export { MU };
