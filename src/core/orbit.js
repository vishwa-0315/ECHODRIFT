/**
 * Two-body orbital mechanics in the plane: orbital elements from a state,
 * analytic Kepler propagation (used to validate the integrator), and a
 * Lambert solver (used for real launch-window "porkchop" plots).
 */

/** Orbital elements of state (rx, ry, vx, vy) about a body with parameter mu. */
export function elements(rx, ry, vx, vy, mu) {
  const r = Math.hypot(rx, ry);
  const v2 = vx * vx + vy * vy;
  const h = rx * vy - ry * vx; // specific angular momentum (z)
  const energy = v2 / 2 - mu / r;
  // eccentricity vector
  const rv = rx * vx + ry * vy;
  const ex = ((v2 - mu / r) * rx - rv * vx) / mu;
  const ey = ((v2 - mu / r) * ry - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const a = energy < 0 ? -mu / (2 * energy) : Infinity;
  const p = (h * h) / mu;
  const peri = p / (1 + e);
  const apo = e < 1 ? p / (1 - e) : Infinity;
  const argp = Math.atan2(ey, ex);
  // true anomaly: angle from periapsis to the craft, measured in the direction of motion
  const nu = Math.atan2((Math.sign(h) || 1) * (ex * ry - ey * rx), ex * rx + ey * ry);
  const period = energy < 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;
  // flight-path angle (angle of velocity above local horizontal)
  const gamma = Math.atan2(rv / r, Math.abs(h) / r);
  return { r, v: Math.sqrt(v2), h, energy, e, a, p, peri, apo, argp, nu, period, gamma, ex, ey, prograde: h >= 0 };
}

/** Solve Kepler's equation E − e sin E = M. */
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/** Analytic propagation of an elliptic orbit by dt (for tests / previews). */
export function keplerPropagate(rx, ry, vx, vy, mu, dt) {
  const el = elements(rx, ry, vx, vy, mu);
  if (el.e >= 1) throw new Error('keplerPropagate: elliptic only');
  const n = Math.sqrt(mu / el.a ** 3);
  const nu0 = el.nu;
  // eccentric anomaly from true anomaly
  const E0 = 2 * Math.atan(Math.sqrt((1 - el.e) / (1 + el.e)) * Math.tan(nu0 / 2));
  const M = E0 - el.e * Math.sin(E0) + n * dt;
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), el.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  const r = el.a * (1 - el.e * Math.cos(E));
  const s = Math.sign(el.h) || 1;
  const ang = el.argp + s * nu;
  const px = r * Math.cos(ang);
  const py = r * Math.sin(ang);
  const vr = Math.sqrt(mu / el.p) * el.e * Math.sin(nu);
  const vt = Math.sqrt(mu / el.p) * (1 + el.e * Math.cos(nu));
  return {
    x: px,
    y: py,
    vx: vr * Math.cos(ang) - s * vt * Math.sin(ang),
    vy: vr * Math.sin(ang) + s * vt * Math.cos(ang),
  };
}

/* ---------- Stumpff functions & Lambert (universal variables, Bate–Mueller–White) ---------- */
function stumpC(z) {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}
function stumpS(z) {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/**
 * Lambert's problem: velocity at r1 and r2 for a transfer taking `tof` seconds.
 * r1, r2: [x, y]; prograde transfer (counter-clockwise, like the planets).
 * Returns { v1:[vx,vy], v2:[vx,vy] } or null if no solution converges.
 */
export function lambert(r1, r2, tof, mu, prograde = true) {
  const R1 = Math.hypot(r1[0], r1[1]);
  const R2 = Math.hypot(r2[0], r2[1]);
  const cross = r1[0] * r2[1] - r1[1] * r2[0];
  let dth = Math.acos(Math.max(-1, Math.min(1, (r1[0] * r2[0] + r1[1] * r2[1]) / (R1 * R2))));
  if (prograde ? cross < 0 : cross >= 0) dth = 2 * Math.PI - dth;
  const A = Math.sin(dth) * Math.sqrt((R1 * R2) / (1 - Math.cos(dth)));
  if (Math.abs(A) < 1e-12) return null;
  const y = (z) => R1 + R2 + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z));
  const F = (z) => {
    const yz = y(z);
    if (yz < 0) return NaN;
    return (yz / stumpC(z)) ** 1.5 * stumpS(z) + A * Math.sqrt(yz) - Math.sqrt(mu) * tof;
  };
  // bracket z where y(z) > 0, then bisect + secant
  let lo = -4 * Math.PI * Math.PI;
  while (y(lo) < 0) lo += 0.1;
  let hi = 4 * Math.PI * Math.PI - 1e-6;
  let flo = F(lo);
  let fhi = F(hi);
  if (!(flo < 0 && fhi > 0)) {
    // scan for a sign change
    let found = false;
    let prevZ = lo;
    let prevF = flo;
    for (let z = lo; z < hi; z += 0.05) {
      const fz = F(z);
      if (Number.isFinite(fz) && Number.isFinite(prevF) && prevF < 0 && fz > 0) {
        lo = prevZ;
        hi = z;
        found = true;
        break;
      }
      prevZ = z;
      prevF = fz;
    }
    if (!found) return null;
  }
  let z = 0;
  for (let i = 0; i < 200; i++) {
    z = (lo + hi) / 2;
    const fz = F(z);
    if (!Number.isFinite(fz)) {
      lo = z;
      continue;
    }
    if (Math.abs(fz) < 1e-6 * Math.sqrt(mu) * tof * 1e-8 || hi - lo < 1e-13) break;
    if (fz < 0) lo = z;
    else hi = z;
  }
  const yz = y(z);
  const f = 1 - yz / R1;
  const g = A * Math.sqrt(yz / mu);
  const gdot = 1 - yz / R2;
  const v1 = [(r2[0] - f * r1[0]) / g, (r2[1] - f * r1[1]) / g];
  const v2 = [(gdot * r2[0] - r1[0]) / g, (gdot * r2[1] - r1[1]) / g];
  return { v1, v2 };
}

/** Circular orbital speed. */
export const vCirc = (mu, r) => Math.sqrt(mu / r);
/** Escape speed. */
export const vEsc = (mu, r) => Math.sqrt((2 * mu) / r);
/** Vis-viva: speed at radius r on an orbit of semi-major axis a. */
export const visViva = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));
