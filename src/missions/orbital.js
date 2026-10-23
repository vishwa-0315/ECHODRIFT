/**
 * Orbital missions: setup from real data, stage objectives and Mission Assist.
 * All checks and assists run on the same physics the player flies.
 */
import { createOrbitalSim } from '../core/orbitalsim.js';
import { helioState } from '../core/ephem.js';
import { lambert, elements } from '../core/orbit.js';
import { MU, RADIUS, DAY, G0 } from '../core/constants.js';
import { solve1D, minimize1D, nelderMead, nextPeriapsis, nextApoapsis, smallestRoot } from '../core/targeting.js';
import { propellantFor } from '../core/ship.js';

const km = (m) => m / 1e3;
const alt = (body, d) => d - RADIUS[body];
const finiteOr = (v, d) => (Number.isFinite(v) ? v : d);

/* ===================== shared helpers ===================== */

/** Orbit (peri/apo altitudes, km) about a body after a hypothetical future time. */
export function orbitAfter(sim, body, horizon) {
  const p = sim.predict(horizon, Math.max(60, horizon / 50));
  if (p.crashed) return { crashed: p.crashed.body };
  const r = sim.rel(body, p.final, p.tEnd);
  const el = elements(r.x, r.y, r.vx, r.vy, MU[body]);
  return { peri: alt(body, el.peri), apo: Number.isFinite(el.apo) ? alt(body, el.apo) : Infinity, bound: el.energy < 0, el };
}

/** Rotating Sun–Earth frame (Earth at origin, Sun at −x). */
export function toRotating(sim, x, y, t, vx = 0, vy = 0) {
  const e = sim.bodyState('earth', t, {});
  const th = Math.atan2(e.y, e.x);
  const w = (e.x * e.vy - e.y * e.vx) / (e.x * e.x + e.y * e.y);
  const c = Math.cos(-th), s = Math.sin(-th);
  const dx = x - e.x, dy = y - e.y;
  const rx = c * dx - s * dy, ry = s * dx + c * dy;
  const dvx = vx - e.vx, dvy = vy - e.vy;
  return { x: rx, y: ry, vx: c * dvx - s * dvy + w * ry, vy: s * dvx + c * dvy - w * rx, th };
}

/* ===================== mission builders ===================== */

export function buildMission(m, design, choice = {}) {
  const P = m.physics;
  const base = { span: P.span * DAY, central: P.central, perturbers: P.perturbers, ship: P.ship, entryInterface: P.entryInterface };
  switch (m.id) {
    case 'chandrayaan3': {
      const Re = RADIUS.earth;
      const rp = Re + P.startOrbitKm[0] * 1e3, ra = Re + P.startOrbitKm[1] * 1e3, a = (rp + ra) / 2;
      const vp = Math.sqrt(MU.earth * (2 / rp - 1 / a));
      const th = (P.perigeeLongitudeDeg * Math.PI) / 180;
      const sim = createOrbitalSim({ ...base, epoch: m.date, state: { x: rp * Math.cos(th), y: rp * Math.sin(th), vx: -vp * Math.sin(th), vy: vp * Math.cos(th) } });
      return { sim, ...chandrayaan(m, sim) };
    }
    case 'apollo13': {
      const d = design.apollo13;
      const sim = createOrbitalSim({ ...base, epoch: d.epoch, state: { x: d.state[0], y: d.state[1], vx: d.state[2], vy: d.state[3] } });
      return { sim, ...apollo13(m, sim) };
    }
    case 'voyager2': {
      const d = design.voyager2;
      const sim = createOrbitalSim({ ...base, epoch: d.epoch, state: { x: d.state[0], y: d.state[1], vx: d.state[2], vy: d.state[3] } });
      return { sim, ...voyager2(m, sim) };
    }
    case 'aditya': {
      const d = design.aditya;
      const E = helioState('earth', new Date(d.epoch));
      const D = Math.hypot(E.x, E.y), th = Math.atan2(E.y, E.x);
      const w = (E.x * E.vy - E.y * E.vx) / (D * D), rdot = (E.x * E.vx + E.y * E.vy) / D;
      const c = Math.cos(th), s = Math.sin(th);
      const X = (d.x0 + d.mu) * D;
      const vyRot = d.vy0 * D * w - P.insertionErrorMs; // arriving slightly too slow: HOI burn needed
      const VX = (rdot / D) * X, VY = vyRot + w * X;
      const sim = createOrbitalSim({ ...base, epoch: d.epoch, hmax: 6 * 3600, state: { x: c * X, y: s * X, vx: c * VX - s * VY, vy: s * VX + c * VY } });
      return { sim, ...aditya(m, sim, d) };
    }
    case 'mangalyaan': {
      const sim = mangalyaanCruise(m, choice);
      return { sim, ...mangalyaan(m, sim) };
    }
    default:
      throw new Error('Unknown orbital mission ' + m.id);
  }
}

/* ---------- Chandrayaan-3 ---------- */
function chandrayaan(m, sim) {
  const P = m.physics;
  const Re = RADIUS.earth, Rm = RADIUS.moon;
  const cap = P.captureKm;
  const captured = (s) => {
    const el = s.elementsAbout('moon');
    return el.energy < 0 && km(alt('moon', el.peri)) >= cap.periMin && km(alt('moon', el.peri)) <= cap.periMax && km(alt('moon', el.apo)) <= cap.apoMax;
  };
  const stages = [
    {
      id: 'raise',
      focus: 'earth',
      check: (s) => (km(alt('earth', s.elementsAbout('earth').apo)) > 100000 ? 'done' : null),
      assist: (s) => {
        const p = nextPeriapsis(s, 'earth', 4 * DAY);
        if (!p) return null;
        const cur = km(alt('earth', s.elementsAbout('earth').apo));
        const target = cur < 60000 ? 71000e3 : 127000e3;
        const f = (dv) => {
          s.clearNodes();
          s.addNode({ t: p.t, dv, ref: 'earth' });
          const o = orbitAfter(s, 'earth', p.t - s.t + 4000);
          return (o.crashed ? -1e12 : finiteOr(o.apo, 1e10)) - target;
        };
        const dv = solve1D(f, 1, 900, { tol: 2e5 });
        s.clearNodes();
        return dv ? [{ t: p.t, dv, ref: 'earth', angle: 0 }] : null;
      },
    },
    {
      id: 'tli',
      focus: 'earth',
      // done once the craft is actually within 60,000 km of the Moon (inside its sphere of influence)
      check: (s) => (Math.hypot(s.rel('moon').x, s.rel('moon').y) < 60000e3 ? 'done' : null),
      predictTarget: 'moon',
      onTrack: (s, ctx) => {
        const c = ctx.prediction?.closest?.moon;
        return !!c && c.t > s.t && c.d < RADIUS.moon + 30000e3 && !ctx.prediction.crashed;
      },
      coastStep: (s, ctx) => {
        const c = ctx.prediction?.closest?.moon;
        return c && c.t > s.t ? Math.max(600, Math.min(0.5 * DAY, c.t - s.t - 10 * 3600)) : 0.5 * DAY;
      },
      assist: (s) => {
        // try the next few perigees; choose the first where a TLI reaches the Moon
        const probe = createOrbitalSim(s.def);
        probe.t = s.t;
        probe.y = s.y.slice();
        for (let k = 0; k < 8; k++) {
          const p = nextPeriapsis(probe, 'earth', 6 * DAY);
          if (!p) return null;
          const pre = createOrbitalSim(s.def);
          pre.t = probe.t;
          pre.y = probe.y.slice();
          const peril = (dv) => {
            pre.clearNodes();
            pre.addNode({ t: p.t, dv, ref: 'earth' });
            const pr = pre.predict(p.t - pre.t + 7 * DAY, 900);
            if (pr.crashed?.body === 'moon') return -Rm;
            const c = pr.closest.moon;
            return c && c.t > p.t ? c.d - Rm : 1e12;
          };
          let best = null;
          for (let dv = 100; dv <= 800; dv += 10) {
            const d = peril(dv);
            if (!best || Math.abs(d - 300e3) < Math.abs(best.d - 300e3)) best = { dv, d };
          }
          if (best && best.d < 30000e3) {
            const dv = minimize1D((x) => Math.abs(peril(x) - 300e3), best.dv - 10, best.dv + 10, 30);
            return [{ t: p.t, dv, ref: 'earth', angle: 0 }];
          }
          probe.advance(p.t - probe.t + 3600);
        }
        return null;
      },
    },
    {
      id: 'loi',
      focus: 'moon',
      check: (s) => (captured(s) ? 'done' : null),
      assist: (s) => {
        const p = nextPeriapsis(s, 'moon', 3 * DAY);
        if (!p) return null;
        const f = (dv) => {
          s.clearNodes();
          s.addNode({ t: p.t, dv, ref: 'moon', angle: 180 });
          const o = orbitAfter(s, 'moon', p.t - s.t + 4000);
          // capture into a ~5,000 km apolune: much higher orbits are torn apart by Earth's tides within a day
          return (o.crashed ? -1e12 : finiteOr(o.apo, 1e9)) - 5000e3;
        };
        const dv = solve1D(f, 50, 1200, { tol: 5e4 });
        s.clearNodes();
        return dv ? [{ t: p.t, dv, ref: 'moon', angle: 180 }] : null;
      },
    },
    {
      id: 'circular',
      bonus: true,
      focus: 'moon',
      check: (s) => {
        const el = s.elementsAbout('moon');
        return el.energy < 0 && km(alt('moon', el.apo)) <= P.circularKm.max && km(alt('moon', el.peri)) >= 90 ? 'done' : null;
      },
      assist: (s) => {
        // Circularise like ISRO did: brake at perilune to lower apolune in steps,
        // but first raise perilune at apolune whenever it has sunk below 120 km.
        const el = s.elementsAbout('moon');
        const periAlt = alt('moon', el.peri);
        const raising = periAlt < 120e3;
        const p = raising ? nextApoapsis(s, 'moon', 2 * DAY) : nextPeriapsis(s, 'moon', 2 * DAY);
        if (!p) return null;
        const angle = raising ? 0 : 180;
        const target = raising ? 160e3 : Math.max(170e3, Math.min(alt('moon', el.apo) * 0.4, alt('moon', el.apo) - 800e3));
        const f = (dv) => {
          s.clearNodes();
          s.addNode({ t: p.t, dv, ref: 'moon', angle });
          const o = orbitAfter(s, 'moon', p.t - s.t + 2500);
          if (o.crashed) return raising ? -1e12 : -1e12;
          return (raising ? o.peri : o.apo) - target;
        };
        const dv = raising ? solve1D(f, 0.5, 300, { tol: 3e3 }) : solve1D((x) => -f(x), 1, 600, { tol: 3e3 });
        s.clearNodes();
        return dv ? [{ t: p.t, dv, ref: 'moon', angle }] : null;
      },
    },
  ];
  return {
    stages,
    bodies: ['earth', 'moon'],
    successStage: 'loi',
    predictHorizon: () => 7 * DAY,
    stars(s, done) {
      const tLoi = this.doneAt?.loi;
      return 1 + (tLoi != null && s.date(tLoi) <= new Date('2023-08-06T00:00:00Z') ? 1 : 0) + (done.has('circular') ? 1 : 0);
    },
    readout: (s) => {
      const em = s.rel('moon');
      return { distMoonKm: Math.hypot(em.x, em.y) / 1e3 };
    },
  };
}

/* ---------- Apollo 13 ---------- */
function apollo13(m, sim) {
  const [lo, hi] = m.physics.corridor;
  const entryVerdict = (g) => (g == null ? 'none' : g < lo ? 'steep' : g > hi ? 'shallow' : 'ok');
  const stages = [
    {
      id: 'freeReturn',
      focus: 'earth',
      predictTarget: 'entry',
      onTrack: (s, ctx) => ctx.prediction?.entry && entryVerdict(ctx.prediction.entry.gamma) === 'ok',
      check: (s, ctx) => (ctx.prediction?.entry && entryVerdict(ctx.prediction.entry.gamma) === 'ok' && !s.nodes.length ? 'done' : null),
      assist: (s) => {
        // the earliest time (now, or a few hours later) at which a small burn restores a safe free return
        for (const wait of [1800, 3, 6, 9, 12, 15, 18].map((x, i) => (i ? x * 3600 : x))) {
          const t = s.t + wait;
          const gam = (dv) => {
            s.clearNodes();
            if (Math.abs(dv) > 1e-3) s.addNode({ t, dv: Math.abs(dv), ref: 'earth', angle: dv > 0 ? 0 : 180 });
            const pr = s.predict(4.5 * DAY, 1200);
            if (pr.entry) return pr.entry.gamma;
            return pr.crashed ? NaN : 10; // missed Earth = "too shallow"; hitting the Moon is not an answer
          };
          const dv = smallestRoot((x) => gam(x) + 6.5, 40, 0.5, { tol: 0.02 });
          s.clearNodes();
          if (dv != null) return [{ t, dv: Math.abs(dv), ref: 'earth', angle: dv > 0 ? 0 : 180 }];
        }
        return null;
      },
    },
    {
      id: 'pc2',
      bonus: true,
      focus: 'earth',
      // passed the Moon and predicted entry earlier than the real splashdown, still in the corridor
      check: (s, ctx) => {
        const e = ctx.prediction?.entry;
        return e && entryVerdict(e.gamma) === 'ok' && s.date(e.t) < new Date('1970-04-17T18:00:00Z') && s.closest.moon && s.t > s.closest.moon.t + 3600 && s.deliveredDv > 100 && !s.nodes.length ? 'done' : null;
      },
      assist: (s) => {
        const pm = s.closest.moon;
        const t = Math.max(s.t + 1800, (pm?.t ?? s.t) + 2 * 3600);
        const gam = (ang) => {
          s.clearNodes();
          s.addNode({ t, dv: 262, ref: 'earth', angle: ang });
          const pr = s.predict(3.5 * DAY, 3600);
          return pr.entry ? pr.entry.gamma : 10;
        };
        const ang = smallestRoot((a) => gam(a) + 6.5, 60, 2, { tol: 0.02 });
        s.clearNodes();
        return ang == null ? null : [{ t, dv: 262, ref: 'earth', angle: ang }];
      },
    },
  ];
  return {
    stages,
    bodies: ['earth', 'moon'],
    successStage: 'freeReturn',
    predictHorizon: () => 4.5 * DAY,
    entryVerdict,
    endOn: 'entry',
    finalVerdict: (s) => (s.status === 'entered' ? entryVerdict(s.entry?.gamma) : s.status),
    stars: (s, done) => (entryVerdict(s.entry?.gamma) === 'ok' ? 1 + (done.has('pc2') ? 1 : 0) + (s.entry && Math.abs(s.entry.gamma + 6.5) < 0.3 ? 1 : 0) : 0),
  };
}

/* ---------- Voyager 2 ---------- */
function voyager2(m, sim) {
  const target = m.physics.saturnTargetKm * 1e3;
  const predictSaturn = (s, nodes) => {
    s.clearNodes();
    for (const n of nodes) s.addNode(n);
    const end = (Date.parse('1981-12-31T00:00:00Z') - s.epoch.getTime()) / 1000 - s.t;
    const pr = s.predict(end, 2 * DAY);
    return pr;
  };
  const stages = [
    {
      id: 'aim',
      focus: 'sun',
      predictTarget: 'saturn',
      check: (s, ctx) => (ctx.prediction?.closest?.saturn && ctx.prediction.closest.saturn.d < target && !s.nodes.length ? 'done' : null),
      assist: (s) => {
        const t = s.t + DAY;
        const f = ([dv, ang]) => {
          const pr = predictSaturn(s, [{ t, dv: Math.abs(dv), angle: ang, ref: 'sun' }]);
          const d = pr.closest.saturn?.d ?? 1e13;
          return ((d - 300000e3) / 1e9) ** 2 + 1e-4 * dv * dv;
        };
        let best = null;
        for (let ang = -180; ang < 180; ang += 30) for (const dv of [0.3, 1, 3]) {
          const v = f([dv, ang]);
          if (!best || v < best.v) best = { v, p: [dv, ang] };
        }
        const r = nelderMead(f, best.p, [best.p[0] * 0.5, 15], { iters: 80 });
        s.clearNodes();
        return [{ t, dv: Math.abs(r.x[0]), angle: r.x[1], ref: 'sun' }];
      },
    },
    {
      id: 'saturn',
      focus: 'saturn',
      check: (s) => (s.closest.saturn && s.closest.saturn.d < target && s.t > s.closest.saturn.t + 5 * DAY ? 'done' : null),
    },
  ];
  return {
    stages,
    bodies: ['jupiter', 'saturn'],
    successStage: 'saturn',
    predictHorizon: (s) => (Date.parse('1981-12-31T00:00:00Z') - s.epoch.getTime()) / 1000 - s.t,
    stars: (s) => {
      const d = s.closest.saturn?.d ?? Infinity;
      return d < target ? 1 + (d < 300000e3 ? 1 : 0) + (s.deliveredDv < 2 ? 1 : 0) : 0;
    },
  };
}

/* ---------- Aditya-L1 ---------- */
function aditya(m, sim, d) {
  const box = m.physics.box;
  const holdS = m.physics.holdDays * DAY;
  const year = 365.25636 * DAY;
  const Tnd = (d.periodDays / 365.25636) * 2 * Math.PI;
  const ref = d.reference;
  const refAt = (t) => {
    const u = ((((t / year) * 2 * Math.PI) / Tnd) % 1) * (ref.length - 1);
    const i = Math.floor(u), f = u - i;
    return [ref[i][0] * (1 - f) + ref[i + 1][0] * f, ref[i][1] * (1 - f) + ref[i + 1][1] * f];
  };
  const inBox = (s) => {
    const r = toRotating(s, s.y[0], s.y[1], s.t);
    return r.x >= box.xMinKm * 1e3 && r.x <= box.xMaxKm * 1e3 && Math.abs(r.y) <= box.yMaxKm * 1e3;
  };
  const stages = [
    {
      id: 'hold',
      focus: 'l1',
      afterBurnCoast: 30 * DAY,
      coastStep: () => 30 * DAY,
      check: (s) => (!inBox(s) ? 'fail' : s.t >= holdS ? 'done' : null),
      assist: (s) => {
        const H = 30 * DAY;
        const th = toRotating(s, s.y[0], s.y[1], s.t).th;
        const mk = (vx, vy) => {
          s.clearNodes();
          const mag = Math.hypot(vx, vy);
          if (mag > 1e-4) s.addNode({ t: s.t + 600, dv: mag, angle: ((Math.atan2(vy, vx) + th) * 180) / Math.PI, inertial: true });
        };
        const miss = (vx, vy) => {
          mk(vx, vy);
          const p = s.predict(H, H);
          const r = toRotating(s, p.final[0], p.final[1], p.tEnd);
          const g = refAt(p.tEnd);
          return [r.x - g[0], r.y - g[1]];
        };
        let v = [0, 0];
        for (let it = 0; it < 6; it++) {
          const m0 = miss(v[0], v[1]);
          if (Math.hypot(...m0) < 5e3) break;
          const h = 0.05;
          const mx = miss(v[0] + h, v[1]), my = miss(v[0], v[1] + h);
          const J = [[(mx[0] - m0[0]) / h, (my[0] - m0[0]) / h], [(mx[1] - m0[1]) / h, (my[1] - m0[1]) / h]];
          const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
          v = [v[0] - (J[1][1] * m0[0] - J[0][1] * m0[1]) / det, v[1] - (-J[1][0] * m0[0] + J[0][0] * m0[1]) / det];
        }
        s.clearNodes();
        const mag = Math.hypot(...v);
        return mag < 1e-3 ? [] : [{ t: s.t + 600, dv: mag, angle: ((Math.atan2(v[1], v[0]) + th) * 180) / Math.PI, inertial: true }];
      },
    },
  ];
  return {
    stages,
    bodies: ['earth', 'moon'],
    successStage: 'hold',
    predictHorizon: () => 40 * DAY,
    rotating: true,
    reference: (t) => refAt(t),
    box,
    stars: (s) => 1 + (s.deliveredDv < 150 ? 1 : 0) + (s.deliveredDv < 90 ? 1 : 0),
    progress: (s) => Math.min(1, s.t / holdS),
  };
}

/* ---------- Mangalyaan ---------- */

/** Porkchop grid from real ephemerides (Lambert). */
export function porkchop(m, stepDays = 4, tofStep = 8) {
  const W = m.physics.window;
  const t0 = Date.parse(W.departFrom + 'T00:00:00Z');
  const t1 = Date.parse(W.departTo + 'T00:00:00Z');
  const rows = [];
  for (let t = t0; t <= t1; t += stepDays * DAY * 1000) {
    const e = helioState('earth', new Date(t));
    const row = [];
    for (let tof = W.tofMin; tof <= W.tofMax; tof += tofStep) {
      const arr = new Date(t + tof * DAY * 1000);
      const ma = helioState('mars', arr);
      const sol = lambert([e.x, e.y], [ma.x, ma.y], tof * DAY, MU.sun);
      if (!sol) {
        row.push(null);
        continue;
      }
      const c3 = ((sol.v1[0] - e.vx) ** 2 + (sol.v1[1] - e.vy) ** 2) / 1e6;
      const vinf = Math.hypot(sol.v2[0] - ma.vx, sol.v2[1] - ma.vy);
      row.push({ dep: t, tof, c3, vinf, budget: missionBudget(m, c3, vinf) });
    }
    rows.push(row);
  }
  return rows;
}

/** Δv and propellant needed for TMI (from MOM's last Earth orbit) and MOI. */
export function missionBudget(m, c3, vinf) {
  const P = m.physics;
  const Re = RADIUS.earth;
  const rp = Re + P.preTMIorbitKm[0] * 1e3, ra = Re + P.preTMIorbitKm[1] * 1e3;
  const vEll = Math.sqrt(MU.earth * (2 / rp - 2 / (rp + ra)));
  const tmi = Math.sqrt(c3 * 1e6 + (2 * MU.earth) / rp) - vEll;
  const Rm = RADIUS.mars;
  const rpm = Rm + 420e3, ram = Rm + 77000e3;
  const moi = Math.sqrt(vinf * vinf + (2 * MU.mars) / rpm) - Math.sqrt(MU.mars * (2 / rpm - 2 / (rpm + ram)));
  const isp = P.ship.engine.isp;
  const m0 = P.massBeforeTMI;
  const propTMI = propellantFor(tmi, isp, m0);
  const m1 = m0 - propTMI;
  const propMOI = propellantFor(moi * 1.08, isp, m1); // ~8% gravity loss for a 23-minute burn
  const left = m1 - propMOI - P.ship.dryMass;
  return { tmi, moi, propTMI, propMOI, left, ok: left > 5, massAfterTMI: m1 };
}

/** Build the cruise sim for a chosen departure; aim just outside Mars (≈30,000 km) like a real injection. */
export function mangalyaanCruise(m, choice) {
  const P = m.physics;
  const dep = choice.dep ?? Date.parse('2013-12-01T00:00:00Z');
  const tof = choice.tof ?? 297;
  const arr = dep + tof * DAY * 1000;
  const e = helioState('earth', new Date(dep));
  const ma = helioState('mars', new Date(arr));
  const sol = lambert([e.x, e.y], [ma.x, ma.y], tof * DAY, MU.sun);
  const vinf = [sol.v1[0] - e.vx, sol.v1[1] - e.vy];
  const c3 = (vinf[0] ** 2 + vinf[1] ** 2) / 1e6;
  const bud = missionBudget(m, c3, Math.hypot(sol.v2[0] - ma.vx, sol.v2[1] - ma.vy));
  // Start 3 days after injection, outside most of Earth's pull. Speed relative to
  // Earth follows the energy equation: v = √(v∞² + 2μ/r).
  const start = dep + 3 * DAY * 1000;
  const es = helioState('earth', new Date(start));
  const vi = Math.hypot(vinf[0], vinf[1]);
  const ux = vinf[0] / vi, uy = vinf[1] / vi;
  const r0 = vi * 3 * DAY * 0.93; // distance after 3 days (slightly less than v∞·t because it started faster but decelerated)
  const v0 = Math.sqrt(vi * vi + (2 * MU.earth) / r0);
  const base = { epoch: new Date(start).toISOString(), span: (tof + 40) * DAY, central: 'sun', perturbers: P.perturbers, ship: { ...P.ship, wetMass: bud.massAfterTMI } };
  const mk = (dvx, dvy) =>
    createOrbitalSim({ ...base, state: { x: es.x + ux * r0, y: es.y + uy * r0, vx: es.vx + ux * v0 + dvx, vy: es.vy + uy * v0 + dvy } });
  // Target: at the planned arrival time be 30,000 km to the side of Mars (like a real
  // injection, which aims off-centre and leaves the final correction for later).
  const tArr = (arr - start) / 1000;
  const vArr = [sol.v2[0] - ma.vx, sol.v2[1] - ma.vy];
  const va = Math.hypot(...vArr);
  const offset = [(-vArr[1] / va) * (RADIUS.mars + 30000e3), (vArr[0] / va) * (RADIUS.mars + 30000e3)];
  const missVec = (dvx, dvy) => {
    const sm = mk(dvx, dvy);
    const pr = sm.predict(tArr, DAY);
    const mb = sm.bodyState('mars', pr.tEnd, {});
    return [pr.final[0] - mb.x - offset[0], pr.final[1] - mb.y - offset[1]];
  };
  let v = [0, 0];
  for (let it = 0; it < 8; it++) {
    const err = missVec(v[0], v[1]);
    if (Math.hypot(...err) < 2000e3) break;
    const h = 0.5;
    const a = missVec(v[0] + h, v[1]), b = missVec(v[0], v[1] + h);
    const J = [[(a[0] - err[0]) / h, (b[0] - err[0]) / h], [(a[1] - err[1]) / h, (b[1] - err[1]) / h]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!det) break;
    v = [v[0] - (J[1][1] * err[0] - J[0][1] * err[1]) / det, v[1] - (-J[1][0] * err[0] + J[0][0] * err[1]) / det];
  }
  const sim = mk(v[0], v[1]);
  sim.mission = { dep, tof, c3, budget: bud };
  return sim;
}

function mangalyaan(m, sim) {
  const cap = m.physics.captureKm;
  const captured = (s) => {
    const el = s.elementsAbout('mars');
    return el.energy < 0 && km(alt('mars', el.peri)) >= cap.periMin && km(alt('mars', el.peri)) <= cap.periMax && km(alt('mars', el.apo)) <= cap.apoMax;
  };
  const stages = [
    {
      id: 'tcm',
      focus: 'sun',
      predictTarget: 'mars',
      onTrack: (s, ctx) => {
        const c = ctx.prediction?.closest?.mars;
        const a = c ? km(alt('mars', c.d)) : Infinity;
        return a >= cap.periMin && a <= cap.periMax;
      },
      check: (s, ctx) => {
        const c = ctx.prediction?.closest?.mars;
        if (!c || s.nodes.length) return null;
        const a = km(alt('mars', c.d));
        return a >= cap.periMin && a <= cap.periMax ? 'done' : null;
      },
      assist: (s) => {
        const t = s.t + 2 * DAY;
        const horizon = s.mission.tof * DAY + 30 * DAY - s.t;
        const f = ([dv, ang]) => {
          s.clearNodes();
          s.addNode({ t, dv: Math.abs(dv), angle: ang, ref: 'sun' });
          const p = s.predict(horizon, DAY);
          if (p.crashed?.body === 'mars') return 1e3;
          return ((km(alt('mars', p.closest.mars.d)) - 560) / 1000) ** 2 + 1e-4 * dv * dv;
        };
        let best = null;
        for (let ang = -180; ang < 180; ang += 30) for (const dv of [0.5, 2, 6, 15]) {
          const v = f([dv, ang]);
          if (!best || v < best.v) best = { v, p: [dv, ang] };
        }
        const r = nelderMead(f, best.p, [best.p[0] * 0.5, 12], { iters: 100 });
        s.clearNodes();
        return [{ t, dv: Math.abs(r.x[0]), angle: r.x[1], ref: 'sun' }];
      },
    },
    {
      id: 'moi',
      focus: 'mars',
      check: (s) => (captured(s) ? 'done' : null),
      // cruise: coast until two days before arrival
      coastStep: (s, ctx) => {
        const c = ctx.prediction?.closest?.mars;
        return c && c.t - s.t > 3 * DAY ? c.t - s.t - 2 * DAY : 0.25 * DAY;
      },
      ready: (s, ctx) => {
        const c = ctx.prediction?.closest?.mars;
        return !c || c.t - s.t < 3 * DAY;
      },
      assist: (s) => {
        const p = nextPeriapsis(s, 'mars', 30 * DAY);
        if (!p) return null;
        const f = (dv) => {
          s.clearNodes();
          s.addNode({ t: p.t, dv, ref: 'mars', angle: 180 });
          const o = orbitAfter(s, 'mars', p.t - s.t + 3 * 3600);
          return (o.crashed ? -1e12 : finiteOr(o.apo, 1e9)) - 77000e3;
        };
        const dv = solve1D(f, 200, 2500, { tol: 1e5 });
        s.clearNodes();
        return dv ? [{ t: p.t, dv, ref: 'mars', angle: 180 }] : null;
      },
    },
  ];
  return {
    stages,
    bodies: ['earth', 'mars'],
    successStage: 'moi',
    predictHorizon: (s) => Math.max(5 * DAY, s.mission.tof * DAY + 30 * DAY - s.t),
    stars: (s) => 1 + (s.fuel >= 30 ? 1 : 0) + (s.fuel >= 60 ? 1 : 0),
  };
}

export const _test = { orbitAfter, toRotating };
export { G0 };
