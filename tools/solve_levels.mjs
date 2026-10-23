/**
 * Level solver: proves every flight level in content/flight_levels.json can be
 * beaten on the hardest track (no fuel bonus), and reports how forgiving it is.
 * Usage: node tools/solve_levels.mjs [levelId]
 */
import { readFileSync } from 'node:fs';
import { FlightSim } from '../src/core/flight.js';
import { bodyPos, bodyVel, circularSpeed } from '../src/core/physics.js';

const levels = JSON.parse(readFileSync(new URL('../content/flight_levels.json', import.meta.url)));

function run(level, burn1, policy) {
  const sim = new FlightSim(level, { fuelMult: 1 });
  if (burn1) sim.burn(burn1.x, burn1.y);
  else sim.coast();
  const maxSteps = Math.ceil(level.maxTime * 120) + 10;
  let prevR = null;
  for (let i = 0; i < maxSteps && sim.status === 'flying'; i++) {
    if (policy && sim.burns < sim.maxBurns) prevR = policy(sim, prevR);
    sim.step();
  }
  return sim;
}

// Policy: at closest approach (periapsis) or farthest (apoapsis) to `body`, circularize.
function circularizeAt(kind) {
  let done = false;
  return (sim, prev) => {
    const body = sim.target;
    const p = bodyPos(body, sim.ship.t, sim.world.byId, {});
    const v = bodyVel(body, sim.ship.t, sim.world.byId, {});
    const rx = sim.ship.x - p.x, ry = sim.ship.y - p.y;
    const r = Math.hypot(rx, ry);
    if (!done && prev != null) {
      const turning = kind === 'peri' ? prev.dr < 0 && r - prev.r >= 0 : prev.dr > 0 && r - prev.r <= 0;
      if (turning && sim.ship.t > 0.3) {
        const relvx = sim.ship.vx - v.x, relvy = sim.ship.vy - v.y;
        const sense = Math.sign(rx * relvy - ry * relvx) || 1;
        const vc = circularSpeed(body.mass, r);
        const want = { x: v.x + (-ry / r) * vc * sense, y: v.y + (rx / r) * vc * sense };
        sim.burn(want.x - sim.ship.vx, want.y - sim.ship.vy);
        done = true;
      }
    }
    return { r, dr: prev ? r - prev.r : 0 };
  };
}

// Policy: at closest approach to the goal zone, match the zone's velocity.
function matchZone() {
  let done = false;
  let lastZone = null;
  return (sim, prev) => {
    const z = sim.goalZone();
    const d = Math.hypot(sim.ship.x - z.x, sim.ship.y - z.y);
    if (!done && prev != null && lastZone) {
      if (prev.dd < 0 && d - prev.d >= 0 && d < z.r * 2.5) {
        const zvx = (z.x - lastZone.x) * 120, zvy = (z.y - lastZone.y) * 120;
        // aim slightly toward the centre of the zone too
        const k = 0.6;
        sim.burn(zvx + (z.x - sim.ship.x) * k - sim.ship.vx, zvy + (z.y - sim.ship.y) * k - sim.ship.vy);
        done = true;
      }
    }
    lastZone = { x: z.x, y: z.y };
    return { d, dd: prev ? d - prev.d : 0 };
  };
}

function solve(level) {
  const o = level.objective.type;
  const maxDv = Math.min(level.maxDvPerBurn, level.fuel);
  const results = [];
  const angStep = o === 'land' || o === 'slingshot' || o === 'escape' ? 2 : 6;
  const mags = o === 'land' || o === 'slingshot' || o === 'escape' ? 14 : 8;
  const policies = { single: () => null };
  if (['orbit', 'aerobrake'].includes(o)) { policies.peri = () => circularizeAt('peri'); policies.apo = () => circularizeAt('apo'); }
  if (o === 'hohmann') policies.apo = () => circularizeAt('apo');
  if (['lagrange', 'rendezvous'].includes(o)) policies.match = () => matchZone();
  const burns = [null];
  for (let a = 0; a < 360; a += angStep)
    for (let m = 1; m <= mags; m++) {
      const mag = (maxDv * m) / mags;
      burns.push({ x: Math.cos((a * Math.PI) / 180) * mag, y: Math.sin((a * Math.PI) / 180) * mag });
    }
  let tried = 0;
  for (const [name, mk] of Object.entries(policies)) {
    for (const b of burns) {
      tried++;
      const sim = run(level, b, mk());
      if (sim.status === 'success') results.push({ policy: name, stars: sim.stars, fuel: sim.fuelLeftPct, time: sim.time, hull: sim.hull });
    }
  }
  return { tried, results };
}

const only = process.argv[2];
let allOk = true;
for (const level of levels) {
  if (only && level.id !== only) continue;
  const t0 = Date.now();
  const { tried, results } = solve(level);
  const best = results.sort((a, b) => b.stars - a.stars || b.fuel - a.fuel)[0];
  const ok = results.length > 0;
  allOk &&= ok;
  const by = {};
  results.forEach((r) => (by[r.policy] = (by[r.policy] || 0) + 1));
  console.log(
    `${ok ? 'SOLVABLE' : 'UNSOLVED'} ${level.id.padEnd(10)} ${results.length}/${tried} solutions ${JSON.stringify(by)}` +
      (best ? ` best: ${best.stars}★ fuel ${best.fuel.toFixed(0)}% t=${best.time.toFixed(1)}s hull ${best.hull.toFixed(0)}` : '') +
      ` (${Date.now() - t0}ms)`,
  );
}
if (!allOk) process.exitCode = 1;
