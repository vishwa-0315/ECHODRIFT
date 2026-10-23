/**
 * Real planetary and lunar positions (ephemerides) from astronomy-engine
 * (VSOP87 / ELP-based, accurate to about an arcminute), rotated into the
 * J2000 ecliptic plane and projected onto it (the game is planar).
 *
 * For speed, positions over a mission's time span are tabulated once and
 * interpolated with cubic Hermite splines (position + velocity). With the
 * default steps the interpolation error is metres, far below the
 * ephemeris accuracy itself.
 */
import * as A from 'astronomy-engine';
import { AU, DAY } from './constants.js';

const KM_AU = AU;
const V_AU = AU / DAY; // AU/day → m/s
const ROT = A.Rotation_EQJ_ECL();
const BODY = {
  mercury: A.Body.Mercury,
  venus: A.Body.Venus,
  earth: A.Body.Earth,
  mars: A.Body.Mars,
  jupiter: A.Body.Jupiter,
  saturn: A.Body.Saturn,
  uranus: A.Body.Uranus,
  neptune: A.Body.Neptune,
  moon: A.Body.Moon,
  sun: A.Body.Sun,
};

function toEcl(state) {
  const s = A.RotateState(ROT, state);
  return { x: s.x * KM_AU, y: s.y * KM_AU, z: s.z * KM_AU, vx: s.vx * V_AU, vy: s.vy * V_AU, vz: s.vz * V_AU };
}

/** Heliocentric ecliptic state of a body at a JS Date (m, m/s). */
export function helioState(body, date) {
  if (body === 'sun') return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  if (body === 'moon') {
    const e = helioState('earth', date);
    const m = geoState('moon', date);
    return { x: e.x + m.x, y: e.y + m.y, z: e.z + m.z, vx: e.vx + m.vx, vy: e.vy + m.vy, vz: e.vz + m.vz };
  }
  return toEcl(A.HelioState(BODY[body], date));
}

/** Geocentric ecliptic state (Moon or Sun) at a JS Date. */
export function geoState(body, date) {
  if (body === 'moon') return toEcl(A.GeoMoonState(date));
  if (body === 'sun') {
    const e = helioState('earth', date);
    return { x: -e.x, y: -e.y, z: -e.z, vx: -e.vx, vy: -e.vy, vz: -e.vz };
  }
  if (body === 'earth') return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const e = helioState('earth', date);
  const b = helioState(body, date);
  return { x: b.x - e.x, y: b.y - e.y, z: b.z - e.z, vx: b.vx - e.vx, vy: b.vy - e.vy, vz: b.vz - e.vz };
}

/**
 * Tabulated ephemeris for a mission.
 * center: 'sun' (heliocentric) or 'earth' (geocentric).
 * bodies: names to tabulate. epoch: Date at t = 0. span: seconds. step: seconds.
 */
export function createEphemeris({ center, bodies, epoch, span, step }) {
  const t0 = epoch.getTime();
  const n = Math.ceil(span / step) + 2;
  const tables = {};
  for (const b of bodies) {
    const arr = new Float64Array(n * 4);
    for (let i = 0; i < n; i++) {
      const d = new Date(t0 + i * step * 1000);
      const s = center === 'earth' ? geoState(b, d) : helioState(b, d);
      arr[i * 4] = s.x;
      arr[i * 4 + 1] = s.y;
      arr[i * 4 + 2] = s.vx;
      arr[i * 4 + 3] = s.vy;
    }
    tables[b] = arr;
  }
  const out = { x: 0, y: 0, vx: 0, vy: 0 };
  return {
    center,
    epoch,
    span,
    step,
    bodies,
    /** State of body at mission time t (s). Writes into `o` (or a shared object). */
    state(body, t, o = out) {
      const tab = tables[body];
      if (!tab) {
        o.x = o.y = o.vx = o.vy = 0;
        return o;
      }
      let u = t / step;
      if (u < 0) u = 0;
      let i = Math.floor(u);
      if (i > n - 2) i = n - 2;
      const s = u - i;
      const j = i * 4;
      const k = j + 4;
      const s2 = s * s;
      const s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1;
      const h10 = s3 - 2 * s2 + s;
      const h01 = -2 * s3 + 3 * s2;
      const h11 = s3 - s2;
      const d00 = (6 * s2 - 6 * s) / step;
      const d10 = 3 * s2 - 4 * s + 1;
      const d01 = (-6 * s2 + 6 * s) / step;
      const d11 = 3 * s2 - 2 * s;
      o.x = h00 * tab[j] + h10 * step * tab[j + 2] + h01 * tab[k] + h11 * step * tab[k + 2];
      o.y = h00 * tab[j + 1] + h10 * step * tab[j + 3] + h01 * tab[k + 1] + h11 * step * tab[k + 3];
      o.vx = d00 * tab[j] + d10 * tab[j + 2] + d01 * tab[k] + d11 * tab[k + 2];
      o.vy = d00 * tab[j + 1] + d10 * tab[j + 3] + d01 * tab[k + 1] + d11 * tab[k + 3];
      return o;
    },
  };
}

/** Galilean moon positions as seen from Earth (for the Galileo lab). Returns offsets in Jupiter radii (sky plane, east = +x). */
export function jupiterMoonsSky(date) {
  const info = A.JupiterMoons(date);
  const jup = A.GeoVector(A.Body.Jupiter, date, true);
  const dist = Math.hypot(jup.x, jup.y, jup.z);
  // unit vector toward Jupiter; build sky axes (east, north) from the equatorial frame
  const ux = jup.x / dist, uy = jup.y / dist, uz = jup.z / dist;
  // north celestial pole projected
  let nx = -uz * ux, ny = -uz * uy, nz = 1 - uz * uz;
  const nl = Math.hypot(nx, ny, nz);
  nx /= nl; ny /= nl; nz /= nl;
  // east = north × line-of-sight
  const ex = ny * uz - nz * uy, ey = nz * ux - nx * uz, ez = nx * uy - ny * ux;
  const RJ_AU = 71492e3 / AU;
  const out = {};
  for (const [name, key] of [['Io', 'io'], ['Europa', 'europa'], ['Ganymede', 'ganymede'], ['Callisto', 'callisto']]) {
    const m = info[key];
    out[name] = {
      east: (m.x * ex + m.y * ey + m.z * ez) / RJ_AU,
      north: (m.x * nx + m.y * ny + m.z * nz) / RJ_AU,
      behind: m.x * ux + m.y * uy + m.z * uz > 0,
    };
  }
  return out;
}

export { A as Astronomy };
