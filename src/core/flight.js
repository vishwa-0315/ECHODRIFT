/**
 * ECHO DRIFT — FLY mini-game rules (pure; shared by the game UI and the
 * headless level-solver tests). Owns fuel, hull, burns, hazards, objectives
 * and star scoring. Rendering lives in ui/flight.js.
 */
import {
  DT,
  createWorld,
  initialShip,
  stepShip,
  hitBody,
  bodyPos,
  bodyVel,
  orbitState,
  dominantBody,
} from './physics.js';

/** Fuel cost of a burn: proportional to the change in speed (delta-v). */
export function fuelCost(dvx, dvy, fuelPerDv = 1) {
  return Math.hypot(dvx, dvy) * fuelPerDv;
}

/** Clamp a requested burn to what the tank and the engine allow. */
export function clampBurn(dvx, dvy, fuelLeft, maxDvPerBurn, fuelPerDv = 1) {
  const mag = Math.hypot(dvx, dvy);
  if (mag === 0) return { dvx: 0, dvy: 0 };
  const allowed = Math.min(mag, maxDvPerBurn, fuelLeft / fuelPerDv);
  const k = allowed / mag;
  return { dvx: dvx * k, dvy: dvy * k };
}

/** 1–3 stars: finishing = 1, fuel goal = +1, hull AND time goal = +1. */
export function starRating({ fuelLeftPct, hull, time }, goals) {
  let stars = 1;
  if (fuelLeftPct >= goals.fuelLeftPct) stars++;
  if (hull >= goals.hull && time <= goals.time) stars++;
  return stars;
}

export class FlightSim {
  /**
   * @param level   flight level JSON
   * @param tuning  difficulty-track tuning { fuelMult, previewSeconds, ... }
   */
  constructor(level, tuning = {}) {
    this.level = level;
    this.tuning = tuning;
    this.world = createWorld(level);
    this.ship = initialShip(this.world, level.ship);
    this.fuelMax = level.fuel * (tuning.fuelMult ?? 1);
    this.fuel = this.fuelMax;
    this.fuelPerDv = level.fuelPerDv ?? 1;
    this.maxDvPerBurn = level.maxDvPerBurn;
    this.maxBurns = level.maxBurns ?? 1;
    this.burns = 0;
    this.hull = 100;
    this.status = 'aiming'; // aiming | flying | success | fail
    this.failReason = null;
    this.holdTime = 0;
    this.events = []; // UI-facing one-shot events {type,...}
    this.debris = (level.hazards?.debris || []).map((d, i) => ({ ...d, id: i, alive: true }));
    this.flares = level.hazards?.flares || [];
    this.path = [];
    this._pathTick = 0;
    this._tmp = { x: 0, y: 0 };
    this.target = level.objective.target ? this.world.byId[level.objective.target] : null;
    this.bounds = level.bounds;
  }

  get fuelLeftPct() {
    return this.fuelMax > 0 ? (100 * this.fuel) / this.fuelMax : 0;
  }
  get time() {
    return this.ship.t;
  }
  canBurn() {
    return (this.status === 'aiming' || this.status === 'flying') && this.burns < this.maxBurns && this.fuel > 0.01;
  }
  /** Preview is knocked out while a solar flare is active. */
  previewDisabled() {
    const t = this.ship.t;
    return this.flares.some((f) => t >= f.start && t < f.start + f.duration);
  }

  /** Apply a burn (already in world velocity units). Returns the applied dv. */
  burn(dvx, dvy) {
    if (!this.canBurn()) return null;
    const c = clampBurn(dvx, dvy, this.fuel, this.maxDvPerBurn, this.fuelPerDv);
    const cost = fuelCost(c.dvx, c.dvy, this.fuelPerDv);
    if (cost < 0.001) return null;
    this.ship.vx += c.dvx;
    this.ship.vy += c.dvy;
    this.fuel = Math.max(0, this.fuel - cost);
    this.burns++;
    this.status = 'flying';
    this.events.push({ type: 'burn', dv: Math.hypot(c.dvx, c.dvy) });
    return c;
  }

  /** Let time run without burning (e.g. watch an orbit first). */
  coast() {
    if (this.status === 'aiming') this.status = 'flying';
  }

  /** Advance one fixed physics step. */
  step() {
    if (this.status !== 'flying') return this.status;
    const s = this.ship;
    stepShip(this.world, s, DT);

    // Record a downsampled path (for the ghost replay).
    if (++this._pathTick % 6 === 0) this.path.push(Math.round(s.x), Math.round(s.y));

    // Atmospheric heating: too much drag burns the hull.
    if (s.lastDragAcc > (this.level.heatLimit ?? Infinity)) {
      this.hull -= (s.lastDragAcc - this.level.heatLimit) * 0.6 * DT;
      if (!this._heatWarned) {
        this.events.push({ type: 'heat' });
        this._heatWarned = true;
      }
      if (this.hull <= 0) return this._fail('burnup');
    } else this._heatWarned = false;

    // Solid bodies / event horizons.
    const hit = hitBody(this.world, s, this._tmp);
    if (hit) {
      if (this.level.objective.type === 'land' && hit === this.target) {
        const rel = this._relSpeed(hit);
        if (rel <= this.level.objective.maxSpeed) return this._succeed();
      }
      this.hull = 0;
      return this._fail(hit.type === 'blackhole' ? 'horizon' : 'crash', hit);
    }

    // Debris collisions.
    for (const d of this.debris) {
      if (!d.alive) continue;
      if ((s.x - d.x) ** 2 + (s.y - d.y) ** 2 < (d.r + 6) ** 2) {
        d.alive = false;
        this.hull -= d.damage ?? 34;
        this.events.push({ type: 'debris', x: d.x, y: d.y });
        if (this.hull <= 0) return this._fail('debris');
      }
    }

    // Lost in space / out of time.
    const b = this.bounds;
    const m = b.margin ?? 200;
    if (s.x < -m || s.y < -m || s.x > b.w + m || s.y > b.h + m) return this._fail('lost');
    if (s.t > this.level.maxTime) return this._fail('timeout');

    return this._checkObjective();
  }

  _relSpeed(body) {
    const v = bodyVel(body, this.ship.t, this.world.byId, this._tmp);
    return Math.hypot(this.ship.vx - v.x, this.ship.vy - v.y);
  }
  _dist(body) {
    const p = bodyPos(body, this.ship.t, this.world.byId, this._tmp);
    return Math.hypot(this.ship.x - p.x, this.ship.y - p.y);
  }

  /** Where the current goal zone is (for drawing + checking). */
  goalZone() {
    const o = this.level.objective;
    const t = this.ship.t;
    if (o.type === 'slingshot') return { x: o.x, y: o.y, r: o.r };
    if (o.type === 'lagrange') {
      // L4/L5: 60 degrees ahead of/behind the planet on its orbit.
      const pl = this.world.byId[o.planet];
      const star = this.world.byId[pl.orbit.parent];
      const sp = bodyPos(star, t, this.world.byId, { x: 0, y: 0 });
      const a = pl._phase0 + pl._omega * t + ((o.point === 'L5' ? -60 : 60) * Math.PI) / 180 * Math.sign(pl._omega);
      return { x: sp.x + Math.cos(a) * pl.orbit.radius, y: sp.y + Math.sin(a) * pl.orbit.radius, r: o.r };
    }
    if (o.type === 'rendezvous') {
      const pr = this.world.byId[o.target];
      const p = bodyPos(pr, t, this.world.byId, { x: 0, y: 0 });
      return { x: p.x, y: p.y, r: o.r };
    }
    return null;
  }

  _checkObjective() {
    const o = this.level.objective;
    const s = this.ship;
    let inZone = false;
    switch (o.type) {
      case 'land':
        // Success is decided on touchdown (see step()).
        return this.status;
      case 'slingshot': {
        const z = this.goalZone();
        if ((s.x - z.x) ** 2 + (s.y - z.y) ** 2 < z.r * z.r) return this._succeed();
        return this.status;
      }
      case 'escape': {
        if (this._dist(this.target) >= o.distance) return this._succeed();
        return this.status;
      }
      case 'orbit':
      case 'hohmann':
      case 'aerobrake': {
        const os = orbitState(this.world, s, this.target);
        inZone = os.status === 'orbiting' && os.r >= o.rMin && os.r <= o.rMax;
        // Hohmann/aerobrake also require the whole orbit to stay inside the band.
        if (inZone && (o.type !== 'orbit' || o.strict)) inZone = os.peri >= o.rMin * 0.97 && os.apo <= o.rMax * 1.03;
        break;
      }
      case 'lagrange': {
        const z = this.goalZone();
        inZone = (s.x - z.x) ** 2 + (s.y - z.y) ** 2 < z.r * z.r;
        break;
      }
      case 'rendezvous': {
        const z = this.goalZone();
        const close = (s.x - z.x) ** 2 + (s.y - z.y) ** 2 < z.r * z.r;
        if (close && this._relSpeed(this.target) <= o.maxRelSpeed) return this._succeed();
        return this.status;
      }
      default:
        throw new Error(`Unknown objective type: ${o.type}`);
    }
    if (inZone) {
      this.holdTime += DT;
      if (this.holdTime >= o.hold) return this._succeed();
    } else this.holdTime = 0;
    return this.status;
  }

  /** Kid-readable orbit indicator relative to the dominant body. */
  indicator() {
    const body = this.target && this.target.mass ? this.target : dominantBody(this.world, this.ship);
    if (!body) return { status: 'drifting', body: null };
    const os = orbitState(this.world, this.ship, body);
    return { ...os, body };
  }

  _succeed() {
    this.status = 'success';
    this.stars = starRating(
      { fuelLeftPct: this.fuelLeftPct, hull: Math.max(0, this.hull), time: this.ship.t },
      this.level.goals,
    );
    this.events.push({ type: 'success', stars: this.stars });
    return this.status;
  }
  _fail(reason, body) {
    this.status = 'fail';
    this.failReason = reason;
    this.hull = Math.max(0, this.hull);
    this.events.push({ type: 'fail', reason, body: body?.id });
    return this.status;
  }
}
