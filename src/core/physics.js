/**
 * ECHO DRIFT — gravity engine (pure JS, no DOM; fully unit-testable).
 *
 * Model
 *  - Newtonian gravity a = G*M / (r^2 + eps^2), summed over every massive body.
 *  - Bodies move on *kinematic* circular orbits (or stay fixed). Their orbital
 *    period is DERIVED from the parent's mass (T = 2*pi*sqrt(r^3 / (G*M))), so a
 *    moon moves exactly as gravity says it should and the ship's physics stays
 *    consistent with what the player sees.
 *  - The ship has negligible mass (it never pulls on bodies).
 *  - Integrated with velocity-Verlet on a FIXED timestep. The trajectory
 *    preview calls the very same `stepShip`, so the preview can never lie.
 *  - Optional extras per level: atmospheric drag (aerobraking), CME gusts.
 */

export const G = 1;
export const DT = 1 / 120; // fixed physics step (seconds of game time)

/** Precompute derived orbital data for a level's bodies (mutates copies). */
export function prepareBodies(rawBodies) {
  const bodies = rawBodies.map((b) => ({ ...b }));
  const byId = Object.fromEntries(bodies.map((b) => [b.id, b]));
  for (const b of bodies) {
    if (b.orbit) {
      const parent = byId[b.orbit.parent];
      if (!parent) throw new Error(`Body ${b.id}: unknown orbit parent ${b.orbit.parent}`);
      const r = b.orbit.radius;
      b._omega = Math.sqrt((G * parent.mass) / (r * r * r)) * (b.orbit.clockwise ? -1 : 1);
      b._phase0 = ((b.orbit.phaseDeg || 0) * Math.PI) / 180;
    }
  }
  return { list: bodies, byId };
}

/** Position of a body at game time t (handles nested orbits). */
export function bodyPos(body, t, byId, out = { x: 0, y: 0 }) {
  if (!body.orbit) {
    out.x = body.x;
    out.y = body.y;
    return out;
  }
  const p = bodyPos(byId[body.orbit.parent], t, byId, { x: 0, y: 0 });
  const a = body._phase0 + body._omega * t;
  out.x = p.x + Math.cos(a) * body.orbit.radius;
  out.y = p.y + Math.sin(a) * body.orbit.radius;
  return out;
}

/** Velocity of a body at time t (analytic; used for relative-speed checks). */
export function bodyVel(body, t, byId, out = { x: 0, y: 0 }) {
  if (!body.orbit) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const pv = bodyVel(byId[body.orbit.parent], t, byId, { x: 0, y: 0 });
  const a = body._phase0 + body._omega * t;
  const s = body._omega * body.orbit.radius;
  out.x = pv.x - Math.sin(a) * s;
  out.y = pv.y + Math.cos(a) * s;
  return out;
}

/** Circular-orbit speed around a mass at radius r. */
export function circularSpeed(mass, r) {
  return Math.sqrt((G * mass) / r);
}

/**
 * Build a physics "world" for a level: bodies + environmental effects.
 * env = { softening, atmospheres:[{body, height, density, scaleHeight}], gusts:[...] }
 */
export function createWorld(level) {
  const prepared = prepareBodies(level.bodies);
  return {
    bodies: prepared.list,
    byId: prepared.byId,
    softening: level.softening ?? 2,
    atmospheres: (level.atmospheres || []).map((a) => ({ ...a })),
    gusts: (level.hazards?.gusts || []).map((g) => ({ ...g })),
    _tmp: { x: 0, y: 0 },
  };
}

/** Is a CME gust active at time t? Returns the gust or null. */
export function activeGust(world, t) {
  for (const g of world.gusts) {
    const period = g.period || Infinity;
    const local = isFinite(period) ? ((t - g.start) % period + period) % period : t - g.start;
    if (t >= g.start && local >= 0 && local < g.duration) return g;
  }
  return null;
}

/** Gravitational (+ gust) acceleration at point (x,y) at time t. Velocity-independent. */
export function accelAt(world, x, y, t, out = { x: 0, y: 0 }) {
  let ax = 0;
  let ay = 0;
  const eps2 = world.softening * world.softening;
  const p = world._tmp;
  for (const b of world.bodies) {
    if (!b.mass) continue;
    bodyPos(b, t, world.byId, p);
    const dx = p.x - x;
    const dy = p.y - y;
    const r2 = dx * dx + dy * dy + eps2;
    const inv = (G * b.mass) / (r2 * Math.sqrt(r2));
    ax += dx * inv;
    ay += dy * inv;
  }
  const g = world.gusts.length ? activeGust(world, t) : null;
  if (g) {
    const ang = (g.angleDeg * Math.PI) / 180;
    ax += Math.cos(ang) * g.accel;
    ay += Math.sin(ang) * g.accel;
  }
  out.x = ax;
  out.y = ay;
  return out;
}

/** Atmospheric drag acceleration for velocity (vx,vy) at (x,y). Returns {x,y,rho}. */
export function dragAt(world, x, y, vx, vy, t, out = { x: 0, y: 0, rho: 0 }) {
  out.x = 0;
  out.y = 0;
  out.rho = 0;
  if (!world.atmospheres.length) return out;
  const p = world._tmp;
  for (const a of world.atmospheres) {
    const b = world.byId[a.body];
    bodyPos(b, t, world.byId, p);
    const r = Math.hypot(x - p.x, y - p.y);
    const alt = r - b.radius;
    if (alt < 0 || alt > a.height) continue;
    const rho = a.density * Math.exp(-alt / a.scaleHeight);
    // Drag relative to the (moving) planet's velocity.
    const bv = bodyVel(b, t, world.byId, { x: 0, y: 0 });
    const rvx = vx - bv.x;
    const rvy = vy - bv.y;
    const sp = Math.hypot(rvx, rvy);
    out.x += -rho * sp * rvx;
    out.y += -rho * sp * rvy;
    out.rho += rho;
  }
  return out;
}

const _a0 = { x: 0, y: 0 };
const _a1 = { x: 0, y: 0 };
const _d = { x: 0, y: 0, rho: 0 };

/**
 * Advance the ship one fixed step with velocity-Verlet. Mutates `s`
 * ({x,y,vx,vy,t}). Drag (if any) is evaluated at the start-of-step velocity.
 */
export function stepShip(world, s, dt = DT) {
  accelAt(world, s.x, s.y, s.t, _a0);
  dragAt(world, s.x, s.y, s.vx, s.vy, s.t, _d);
  const ax0 = _a0.x + _d.x;
  const ay0 = _a0.y + _d.y;
  s.x += s.vx * dt + 0.5 * ax0 * dt * dt;
  s.y += s.vy * dt + 0.5 * ay0 * dt * dt;
  accelAt(world, s.x, s.y, s.t + dt, _a1);
  s.vx += 0.5 * (ax0 + _a1.x + _d.x) * dt;
  s.vy += 0.5 * (ay0 + _a1.y + _d.y) * dt;
  s.t += dt;
  s.lastRho = _d.rho;
  s.lastDragAcc = Math.hypot(_d.x, _d.y);
  return s;
}

/**
 * Predict the ship path for `seconds` of game time. Returns a flat array
 * [x0,y0,x1,y1,...] sampled every `sampleEvery` steps. Stops early if the
 * path enters a solid body.
 */
export function predictPath(world, ship, seconds, sampleEvery = 4) {
  const s = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy, t: ship.t };
  const steps = Math.round(seconds / DT);
  const pts = [s.x, s.y];
  const p = { x: 0, y: 0 };
  for (let i = 1; i <= steps; i++) {
    stepShip(world, s);
    if (i % sampleEvery === 0) pts.push(s.x, s.y);
    if (hitBody(world, s, p)) {
      pts.push(s.x, s.y);
      break;
    }
  }
  return pts;
}

/** Returns the body the ship is inside (solid surface / horizon), or null. */
export function hitBody(world, s, tmp = { x: 0, y: 0 }) {
  for (const b of world.bodies) {
    const r = b.type === 'blackhole' ? b.horizon : b.radius;
    if (!r) continue;
    bodyPos(b, s.t, world.byId, tmp);
    const dx = s.x - tmp.x;
    const dy = s.y - tmp.y;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

/** Body whose gravity dominates at the ship's position (largest acceleration). */
export function dominantBody(world, s) {
  let best = null;
  let bestA = -1;
  const p = { x: 0, y: 0 };
  for (const b of world.bodies) {
    if (!b.mass) continue;
    bodyPos(b, s.t, world.byId, p);
    const r2 = (p.x - s.x) ** 2 + (p.y - s.y) ** 2;
    const a = b.mass / Math.max(r2, 1);
    if (a > bestA) {
      bestA = a;
      best = b;
    }
  }
  return best;
}

/**
 * Two-body orbital state of the ship relative to a body: specific energy,
 * periapsis/apoapsis distance and a kid-readable status.
 *   'escaping' — energy >= 0 (will leave)
 *   'falling'  — bound, but periapsis is below the surface
 *   'orbiting' — bound and periapsis clears the surface
 */
export function orbitState(world, s, body) {
  const p = bodyPos(body, s.t, world.byId, { x: 0, y: 0 });
  const v = bodyVel(body, s.t, world.byId, { x: 0, y: 0 });
  const rx = s.x - p.x;
  const ry = s.y - p.y;
  const vx = s.vx - v.x;
  const vy = s.vy - v.y;
  const r = Math.hypot(rx, ry);
  const v2 = vx * vx + vy * vy;
  const mu = G * body.mass;
  const energy = v2 / 2 - mu / r;
  const h = rx * vy - ry * vx; // specific angular momentum (z)
  let peri = 0;
  let apo = Infinity;
  if (energy < 0) {
    const a = -mu / (2 * energy);
    const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
    peri = a * (1 - e);
    apo = a * (1 + e);
  } else {
    const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
    peri = (h * h) / mu / (1 + e);
  }
  const surface = body.type === 'blackhole' ? body.horizon : body.radius;
  let status = 'orbiting';
  if (energy >= 0) status = 'escaping';
  else if (peri <= surface) status = 'falling';
  return { r, speed: Math.sqrt(v2), energy, peri, apo, status };
}

/** Specific mechanical energy of the ship about ONE fixed body (used by tests). */
export function specificEnergy(s, body) {
  const r = Math.hypot(s.x - body.x, s.y - body.y);
  return 0.5 * (s.vx * s.vx + s.vy * s.vy) - (G * body.mass) / r;
}

/** Initial ship state from a level's `ship` block (explicit or "in orbit"). */
export function initialShip(world, shipDef) {
  const s = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
  if (shipDef.orbit) {
    const o = shipDef.orbit;
    const b = world.byId[o.body];
    const p = bodyPos(b, 0, world.byId, { x: 0, y: 0 });
    const v = bodyVel(b, 0, world.byId, { x: 0, y: 0 });
    const ang = ((o.phaseDeg || 0) * Math.PI) / 180;
    const sp = circularSpeed(b.mass, o.radius) * (o.speedFactor ?? 1) * (o.clockwise ? -1 : 1);
    s.x = p.x + Math.cos(ang) * o.radius;
    s.y = p.y + Math.sin(ang) * o.radius;
    s.vx = v.x - Math.sin(ang) * sp;
    s.vy = v.y + Math.cos(ang) * sp;
  } else {
    s.x = shipDef.x;
    s.y = shipDef.y;
    s.vx = shipDef.vx || 0;
    s.vy = shipDef.vy || 0;
  }
  return s;
}
