/**
 * Ten more ISRO levels (build 8). Each uses a different skill from the first
 * twenty, and real physics for its part of the mission. Same level API as
 * levels.js: create() → game { update, status, stars, reason, result, hud,
 * scene, bot, telemetry }. Two-control levels list both labels in `buttons`;
 * the second control arrives as input.holdB / input.tapB.
 */
import { orbitalGame, orbitClock } from './levels.js';
import { MU, DAY, G0 } from '../core/constants.js';

const fmtKm = (m) => `${Math.round(m / 1000).toLocaleString('en-US')} km`;
const deg = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Small RK4 step for the custom levels' own equations of motion. */
function rk4(f, y, h) {
  const k1 = f(y);
  const k2 = f(y.map((v, i) => v + (h / 2) * k1[i]));
  const k3 = f(y.map((v, i) => v + (h / 2) * k2[i]));
  const k4 = f(y.map((v, i) => v + h * k3[i]));
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** A plain (non-orbital) game shell. */
function shell(kind, extra) {
  // keep extra's getters live (a spread would copy their values once)
  const g = extra;
  Object.assign(g, { kind, status: 'play', stars: 0, reason: '', result: [], burning: false });
  g.win = (stars, lines) => ((g.status = 'won'), (g.stars = stars), (g.result = lines));
  g.lose = (reason) => ((g.status = 'lost'), (g.reason = reason));
  return g;
}

/* ------------------------------------------------------------------ */
/* SRE-1: brake out of orbit and splash down on target (22 Jan 2007)   */
/* ------------------------------------------------------------------ */
export const LSRE = {
  id: 'sre1',
  title: 'SRE-1 comes home',
  mission: 'SRE-1',
  agency: 'ISRO',
  year: 2007,
  date: '2007-01-22',
  button: 'BRAKE',
  control: 'hold',
  goal: 'Brake until the red cross (where you will splash down) sits on the green target in the Bay of Bengal.',
  guide: ['Braking makes you fall out of orbit. The longer you brake, the sooner you come down.', 'Hold BRAKE and watch the red cross slide towards the green target. Let go when it is there!'],
  fact: 'On 22 January 2007 the SRE-1 capsule fired its motor, re-entered the air at about 8 km/s and splashed down in the Bay of Bengal after 12 days in orbit.',
  create() {
    const mu = MU.earth, R = 6378e3, rAir = R + 100e3;
    const r0 = R + 637e3;
    const v0 = Math.sqrt(mu / r0);
    // start on the far side; the target is ~230° ahead along the orbit
    const a0 = 200 * deg, tgt = a0 + 230 * deg;
    const tx = R * Math.cos(tgt), ty = R * Math.sin(tgt);
    const world = { central: { name: 'earth', mu, R }, bodies: [], ship: { x: r0 * Math.cos(a0), y: r0 * Math.sin(a0), vx: -v0 * Math.sin(a0), vy: v0 * Math.cos(a0), mass: 555, dry: 470, thrust: 400, isp: 280 }, hitRadius: { earth: rAir }, hmax: 60 };
    let travelled = 0, lastA = a0;
    const miss = (x, y) => {
      let d = Math.atan2(y, x) - tgt;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) * R;
    };
    const g = orbitalGame({
      world,
      dir: 'retro',
      clock: orbitClock(mu, 16),
      burnClock: 18,
      clockR: (gg) => Math.hypot(gg.w.y[0], gg.w.y[1]),
      horizon: () => 2 * Math.PI * Math.sqrt(r0 ** 3 / mu),
      trailStep: 5e4,
      check(gg) {
        const a = Math.atan2(gg.w.y[1], gg.w.y[0]);
        travelled += Math.atan2(Math.sin(a - lastA), Math.cos(a - lastA));
        lastA = a;
        if (travelled > 2.2 * Math.PI) gg.lose('Time is up: you are still in orbit. Hold BRAKE longer so you fall into the air.');
      },
      onHit(gg) {
        const d = miss(gg.w.y[0], gg.w.y[1]);
        if (d > 900e3) return gg.lose(`Splashdown ${fmtKm(d)} from the target. The recovery ships can’t reach you! Watch the red cross.`);
        gg.win(d < 80e3 ? 3 : d < 250e3 ? 2 : 1, ['Splashdown in the Bay of Bengal!', `Distance from target: ${fmtKm(d)}`]);
      },
      info(gg) {
        const hit = gg.pred?.hit;
        return [['Splashdown', hit ? `${fmtKm(miss(hit.x, hit.y))} off` : 'still in orbit'], ['Height', fmtKm(Math.hypot(gg.w.y[0], gg.w.y[1]) - R)]];
      },
      scene: (gg) => ({
        central: 'earth',
        bodies: [],
        rings: [{ body: 'earth', r: rAir, label: '', thin: true }],
        marks: [{ x: tx, y: ty, kind: 'target', label: 'Bay of Bengal' }],
        keepWide: true,
        noInset: true,
        focus: [[R * 1.2, 0], [-R * 1.2, 0], [0, R * 1.2], [0, -R * 1.2]],
      }),
      bot(gg) {
        const hit = gg.pred?.hit;
        const ang = (x, y) => {
          const a = Math.atan2(y, x) - Math.atan2(gg.w.y[1], gg.w.y[0]);
          return (a + 4 * Math.PI) % (2 * Math.PI);
        };
        const toTgt = ang(tx, ty);
        if (gg.w.dvUsed < 1 && (toTgt > 150 * deg || toTgt < 100 * deg)) return { hold: false };
        return { hold: !hit || ang(hit.x, hit.y) > toTgt + 0.2 * deg };
      },
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* AstroSat: turn the telescope onto a target (28 Sep 2015)            */
/* ------------------------------------------------------------------ */
export const LASTRO = {
  id: 'astrosat',
  title: 'Point AstroSat',
  mission: 'AstroSat',
  agency: 'ISRO',
  year: 2015,
  date: '2015-09-28',
  buttons: ['◀ TURN', 'TURN ▶'],
  button: 'TURN',
  control: 'two',
  goal: 'Turn the telescope towards the Crab Nebula and slow down near it. When you are close and slow, the star tracker locks on.',
  guide: ['Spinning wheels inside the satellite turn it. Push once and it keeps turning (nothing stops it in space)!', 'Watch the dashed circle: it shows where you would stop if you pushed back now. Push back when it reaches the target.'],
  fact: 'AstroSat, launched on 28 September 2015 by PSLV-C30, is India’s first space observatory. It looks at stars, galaxies and black holes in ultraviolet and X-ray light.',
  create() {
    const alpha = 0.35 * deg; // angular acceleration from the reaction wheels, rad/s² (sim time)
    const rate = 2.5; // sim seconds per real second
    const capErr = 3.5 * deg, capW = 0.6 * deg; // the star tracker takes over inside this window
    let th = 0, w = 0, t = 0, effort = 0, lock = 0, locked = false, passes = 0, lastSide = -1;
    const target = 62 * deg;
    const g = shell('astro', {
      get theta() {
        return th;
      },
      get omega() {
        return w;
      },
      /** where you would stop if you pushed against the spin right now */
      get stopAt() {
        return th + (Math.sign(w) * w * w) / (2 * alpha);
      },
      get locked() {
        return locked;
      },
      target,
      update(dt, input) {
        if (g.status !== 'play') return;
        const dir = locked ? 0 : (input.hold ? -1 : 0) + (input.holdB ? 1 : 0);
        g.burning = dir !== 0;
        const n = Math.ceil((dt * rate) / 0.01), h = (dt * rate) / n;
        for (let i = 0; i < n; i++) {
          if (locked) {
            // fine pointing: the star tracker steers the wheels to the target (a damped controller)
            const u = Math.max(-alpha, Math.min(alpha, -1.2 * (th - target) - 2.2 * w));
            w += u * h;
          } else w += dir * alpha * h;
          th += w * h;
          t += h;
          effort += Math.abs(dir) * h;
        }
        const err = th - target;
        const side = Math.sign(err);
        if (!locked && side !== lastSide && lastSide !== 0) passes += side > 0 ? 1 : 0;
        lastSide = side;
        if (!locked && Math.abs(err) < capErr && Math.abs(w) < capW) locked = true;
        if (locked) lock += dt * rate;
        if (locked && lock > 4) {
          const st = passes === 0 && t < 70 ? 3 : passes <= 1 && t < 110 ? 2 : 1;
          return g.win(st, ['Star tracker locked on the Crab Nebula!', `Time to point: ${t.toFixed(0)} s`, passes ? `You swung past the target ${passes} time${passes > 1 ? 's' : ''}` : 'Stopped right on target, no overshoot']);
        }
        if (Math.abs(err) > 130 * deg) return g.lose('You spun far past the target and kept going. Push the other way when the dashed circle reaches the target.');
        if (t > 220) return g.lose('The observing slot is over. Turn towards the target, then slow down near it.');
      },
      hud: () => ({ fuel: null, info: [['Off target', locked ? 'locked' : `${((target - th) / deg).toFixed(1)}°`], ['Turning', `${(w / deg).toFixed(2)}°/s`]], alert: !locked && Math.abs(target - th) < 15 * deg && Math.abs(w) > 2.2 * deg ? 'Too fast: push back!' : null }),
      scene: () => ({ kind: 'astro' }),
      bot() {
        if (locked) return {};
        const err = target - th;
        const want = Math.sign(err) * Math.min(3 * deg, Math.sqrt(2 * alpha * 0.7 * Math.abs(err)));
        if (w < want - 0.05 * deg) return { holdB: true };
        if (w > want + 0.05 * deg) return { hold: true };
        return {};
      },
      telemetry: () => [t, Math.abs(target - th) / deg, Math.abs(w) / deg],
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* Chandrayaan-2 orbiter dodges NASA's LRO (18 Oct 2021)               */
/* ------------------------------------------------------------------ */
export const LDODGE = {
  id: 'dodge',
  title: 'Dodge the LRO',
  mission: 'Chandrayaan-2',
  agency: 'ISRO',
  year: 2021,
  date: '2021-10-18',
  button: 'BOOST',
  control: 'hold',
  goal: 'Make a tiny burn so you pass at least 1 km above NASA’s LRO over the north pole.',
  guide: ['Both orbiters will cross over the pole at the same moment, less than 100 m apart!', 'A tiny push lifts the far side of your orbit. Burn half an orbit before the meeting point for the biggest lift.'],
  fact: 'On 18 October 2021 ISRO moved Chandrayaan-2’s orbiter so it would not pass within about 3 km of NASA’s Lunar Reconnaissance Orbiter over the Moon’s north pole.',
  create() {
    const mu = MU.moon, R = 1737.4e3, r0 = R + 100e3;
    const v0 = Math.sqrt(mu / r0), T = 2 * Math.PI * Math.sqrt(r0 ** 3 / mu);
    // meeting point: the north pole (top of the screen). Start 1.4 orbits before it.
    const aMeet = Math.PI / 2, tMeet = 1.4 * T;
    const a0 = aMeet - 2 * Math.PI * 1.4;
    // LRO: passes the pole at tMeet going the other way (orbit in a different plane, shown flat)
    const lro = { name: 'lro', mu: 0, R: 1, a: r0 + 60, retro: true, phase0: aMeet + (2 * Math.PI * tMeet) / T };
    const world = { central: { name: 'moon', mu, R }, bodies: [lro], ship: { x: r0 * Math.cos(a0), y: r0 * Math.sin(a0), vx: -v0 * Math.sin(a0), vy: v0 * Math.cos(a0), mass: 1700, dry: 1600, thrust: 4, isp: 300 }, hmax: 30 };
    let gapAtMeet = null;
    const predictGap = (gg) => {
      const left = tMeet - gg.w.t;
      if (left <= 0) return null;
      const p = gg.w.predict(left, 60);
      const n = p.path.length;
      return Math.hypot(p.path[n - 3], p.path[n - 2]) - lro.a;
    };
    const g = orbitalGame({
      world,
      dir: 'pro',
      clock: () => T / 12,
      burnClock: 50,
      clockR: () => 0,
      horizon: () => T * 0.98,
      trailStep: 2e4,
      beforeStep(gg) {
        if (gg.realT - (gg._gapAt || -1) > 0.2) {
          gg._gap = predictGap(gg);
          gg._gapAt = gg.realT;
        }
      },
      check(gg) {
        if (gg.w.t >= tMeet && gapAtMeet == null) {
          gapAtMeet = Math.hypot(gg.w.y[0], gg.w.y[1]) - lro.a;
          const dv = gg.w.dvUsed;
          if (Math.abs(gapAtMeet) < 1000) return gg.lose(`Only ${Math.round(Math.abs(gapAtMeet))} m apart: far too close! Burn a little longer, half an orbit before the pole.`);
          if (gapAtMeet > 15e3) return gg.lose(`Safe, but you moved ${fmtKm(gapAtMeet)} away and wasted fuel the orbiter needs for science. Use a shorter burn.`);
          gg.win(dv <= 0.38 ? 3 : dv <= 0.6 ? 2 : 1, ['Safe pass over the north pole!', `Gap: ${(gapAtMeet / 1000).toFixed(2)} km`, `Burn: ${(dv * 100).toFixed(0)} cm/s`]);
        }
      },
      onHit: (gg) => gg.lose('Crashed into the Moon!'),
      info: (gg) => [['Gap at pole', gg._gap == null ? '…' : gg._gap < 1000 ? `${Math.round(gg._gap)} m (danger)` : `${(gg._gap / 1000).toFixed(2)} km (safe)`], ['Meet in', `${Math.max(0, (tMeet - gg.w.t) / 60).toFixed(0)} min`]],
      alert: (gg) => (gg._gap != null && gg._gap < 1000 && tMeet - gg.w.t < T * 0.25 ? 'Collision risk!' : null),
      scene: () => ({ central: 'moon', bodies: ['lro'], minR: { lro: 4 }, keepWide: true, noInset: true, marks: [{ x: 0, y: r0, kind: 'target', label: 'Meeting point' }], focus: [[R * 1.25, 0], [-R * 1.25, 0], [0, R * 1.25], [0, -R * 1.25]] }),
      bot(gg) {
        // burn when the pole is about half an orbit ahead, until the predicted gap is safe
        const left = tMeet - gg.w.t;
        const phase = ((left % T) + T) % T;
        if (left < T * 0.3) return {};
        return { hold: Math.abs(phase - T / 2) < T * 0.06 && (gg._gap ?? 0) < 1250 };
      },
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* NavIC: find where you are from three satellites (NVS-01, 2023)      */
/* ------------------------------------------------------------------ */
const C = 299792.458; // km/s
const RE = 6378.137, RGEO = 42164;
const NAVSATS = [32.5, 83, 129.5]; // NavIC geostationary satellites, °E
const CITIES = [['Chennai', 13.08, 80.27], ['Delhi', 28.61, 77.21], ['Mumbai', 19.08, 72.88], ['Kolkata', 22.57, 88.36], ['Bengaluru', 12.97, 77.59], ['Guwahati', 26.14, 91.74], ['Jaipur', 26.91, 75.79], ['Bhopal', 23.26, 77.41], ['Thiruvananthapuram', 8.52, 76.94], ['Port Blair', 11.62, 92.73]];
/** Straight-line distance (km) from a geostationary satellite at longitude L to a place on the ground. */
export function geoRange(L, lat, lon) {
  const p = [RE * Math.cos(lat * deg) * Math.cos(lon * deg), RE * Math.cos(lat * deg) * Math.sin(lon * deg), RE * Math.sin(lat * deg)];
  const s = [RGEO * Math.cos(L * deg), RGEO * Math.sin(L * deg), 0];
  return Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]);
}
const gcKm = (a, b) => {
  const [la1, lo1] = a, [la2, lo2] = b;
  const c = Math.sin(la1 * deg) * Math.sin(la2 * deg) + Math.cos(la1 * deg) * Math.cos(la2 * deg) * Math.cos((lo2 - lo1) * deg);
  return RE * Math.acos(clamp(c, -1, 1));
};
export const LNAVIC = {
  id: 'navic',
  title: 'Find yourself with NavIC',
  mission: 'NVS-01 · NavIC',
  agency: 'ISRO',
  year: 2023,
  date: '2023-05-29',
  button: 'TAP THE MAP',
  control: 'map',
  tapCanvas: true,
  goal: 'Each satellite’s signal tells you how far away it is. Tap the map where all three circles meet.',
  guide: ['Radio signals travel at the speed of light: 300,000 km every second.', 'Each circle is every place that distance away from one satellite. You are where all three meet!'],
  fact: 'NavIC is India’s own satellite navigation system. Its satellites sit about 36,000 km up and give positions over India to within about 20 m.',
  create() {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    const [, lat, lon] = city;
    const sats = NAVSATS.map((L) => {
      const d = geoRange(L, lat, lon);
      return { L, d, ms: (d / C) * 1000 };
    });
    let tries = 0, t = 0, pin = null;
    const g = shell('navic', {
      sats,
      get pin() {
        return pin;
      },
      truth: [lat, lon],
      map: null, // set by the renderer: { toGeo(x, y) → [lat, lon] | null, toXY(lat, lon) → [x, y] }
      update(dt, input) {
        if (g.status !== 'play') return;
        t += dt;
        const pt = input.point;
        if (!pt || !g.map) return;
        const geo = g.map.toGeo(pt.x, pt.y);
        if (!geo) return;
        pin = geo;
        tries++;
        const err = gcKm(geo, [lat, lon]);
        if (err <= 220) return g.win(err < 60 ? 3 : err < 130 ? 2 : 1, [`You are in ${city[0]}!`, `Your guess was ${Math.round(err)} km away (real NavIC: about 20 m)`]);
        if (tries >= 3) return g.lose(`Three guesses used. You were in ${city[0]}. Look for the one spot where all three circles cross.`);
      },
      get triesLeft() {
        return 3 - tries;
      },
      hud: () => ({ fuel: null, info: [['Guesses left', String(3 - tries)], ['Signal speed', '300,000 km/s']] }),
      scene: () => ({ kind: 'navic' }),
      bot() {
        if (!g.map || t < 1) return {};
        const [x, y] = g.map.toXY(lat, lon);
        return { point: { x, y } };
      },
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* LVM3-M4 launch: gravity turn and staging (14 Jul 2023)              */
/* ------------------------------------------------------------------ */
export const LLAUNCH = {
  id: 'lvm3',
  title: 'Launch to orbit',
  mission: 'LVM3-M4',
  agency: 'ISRO',
  year: 2023,
  date: '2023-07-14',
  button: 'STAGE',
  control: 'aim+tap',
  aimLabel: 'Tilt',
  aimMin: 0,
  goal: 'Slide TILT to lean the rocket over as it climbs, and tap STAGE to drop each empty stage. Reach orbit with the low point above 170 km.',
  guide: ['Go straight up first, then slide TILT to lean over: orbit means flying sideways, very fast!', 'When a stage runs out of fuel, tap STAGE to drop it and light the next one. Late in the flight, lift the nose a little so you don’t fall.'],
  fact: 'On 14 July 2023 LVM3-M4 lifted Chandrayaan-3 from Sriharikota into a 170 × 36,500 km orbit, about 16 minutes after liftoff.',
  create() {
    const mu = MU.earth, R = 6378e3;
    // three stages (simplified LVM3): S200 boosters, L110 core, C25 cryogenic upper stage + payload 3.9 t
    const STAGES = [
      { name: 'S200 boosters', m0: 640e3, prop: 410e3, drop: 62e3, thrust: 9.0e6, isp: 274 },
      { name: 'L110 core', prop: 115e3, drop: 15e3, thrust: 1.55e6, isp: 293 },
      { name: 'C25 cryo', prop: 28e3, drop: 0, thrust: 2.0e5, isp: 442 },
    ];
    const vRot = 452; // Earth's spin at Sriharikota, m/s (eastwards)
    const world = { central: { name: 'earth', mu, R }, bodies: [], ship: { x: 0, y: R + 1, vx: -vRot, vy: 0, mass: STAGES[0].m0, dry: STAGES[0].m0 - STAGES[0].prop, thrust: STAGES[0].thrust, isp: STAGES[0].isp }, hmax: 5 };
    let stage = 0, pitch = 0, coast = false, cut = false, lastT = 0;
    const apoGoal = R + 36500e3;
    const cfg = {
      world,
      dir: Math.PI / 2,
      alwaysBurn: true,
      clock: () => 18,
      burnClock: 18,
      clockR: () => 0,
      horizon: (gg) => Math.min(6000, (gg.w.orbitAbout('earth').period || 4000) * 0.6),
      trailStep: 8e3,
      beforeStep(gg, input) {
        if (cut) return;
        const w = gg.w;
        pitch = clamp(input.aim ?? 0, 0, 1) * 90 * deg; // the engines swivel to lean the rocket over
        if (input.tap) {
          if (stage < STAGES.length - 1) {
            const left = w.fuel;
            const next = STAGES[stage + 1];
            w.y[4] = w.y[4] - left - STAGES[stage].drop; // drop the stage (and any fuel still in it)
            stage++;
            w.dry = w.y[4] - next.prop;
            w.thrust = next.thrust;
            w.isp = next.isp;
            gg._wasted = (gg._wasted || 0) + left;
          }
        }
        coast = w.fuel <= 0;
        // thrust direction: tilted from straight up towards the east by `pitch`
        const up = Math.atan2(w.y[1], w.y[0]);
        cfg.dir = up + pitch;
      },
      check(gg) {
        const o = gg.w.orbitAbout('earth');
        if (!cut && o.peri >= R + 170e3 && o.energy < 0) {
          cut = true; // in orbit: engine cut-off
          gg.noEngine = true;
          const left = stage === 2 ? gg.w.fuel / 1000 : 0;
          return gg.win(left >= 5 ? 3 : left >= 2.5 ? 2 : 1, ['In orbit!', `Orbit: ${fmtKm(o.peri - R)} × ${fmtKm(o.apo - R)}`, `Cryogenic fuel left: ${left.toFixed(1)} t (Chandrayaan-3 used it to stretch the far point to 36,500 km)`]);
        }
        if (stage === 2 && gg.w.fuel <= 0) return gg.lose('The last stage ran dry before reaching orbit. Tilt over earlier and drop stages as soon as they are empty.');
        if (o.radialV < 0 && Math.hypot(gg.w.y[0], gg.w.y[1]) < R + 60e3 && gg.w.t > 60) return gg.lose('Falling back! You tilted too far too soon, or waited too long to drop a stage.');
      },
      onHit: (gg) => gg.lose(gg.w.t < 5 ? 'The rocket could not lift off.' : 'The rocket fell back to Earth. Tilt over more gently.'),
      info(gg) {
        const st = STAGES[stage];
        const o = gg.w.orbitAbout('earth');
        return [['Stage', coast && stage < 2 ? `${st.name}: EMPTY` : st.name], ['Low point', o.energy < 0 && o.peri > R ? fmtKm(o.peri - R) : 'below ground']];
      },
      alert: (gg) => (coast && stage < 2 && !cut ? 'Stage empty: tap STAGE!' : null),
      scene: (gg) => {
        const r = Math.hypot(gg.w.y[0], gg.w.y[1]);
        const s = Math.max(500e3, (r - R) * 3);
        return { central: 'earth', bodies: [], keepWide: true, noInset: true, focus: [[gg.w.y[0] - s, gg.w.y[1] - s * 0.4], [gg.w.y[0] + s, gg.w.y[1] + s * 0.6]] };
      },
      bot(gg) {
        const w = gg.w;
        const r = Math.hypot(w.y[0], w.y[1]), h = r - R;
        const o = w.orbitAbout('earth');
        // pitch programme: straight up for the first 6 km, then lean over with height;
        // high up, aim the thrust so we stop falling (gravity minus the 'centrifugal' lift)
        let want = h < 6e3 ? 0 : Math.min(80 * deg, Math.sqrt((h - 6e3) / 140e3) * 80 * deg);
        if (h > 120e3) {
          const a = w.thrust / w.y[4], gnet = MU.earth / r ** 2 - (o.h / r) ** 2 / r;
          const vz = o.radialV;
          const need = clamp((gnet - vz * 0.01) / a, -1, 1);
          want = Math.acos(need);
        }
        return { aim: want / (90 * deg), tap: w.fuel <= 0 && stage < 2 };
      },
    };
    const g = orbitalGame(cfg);
    g.hud = () => ({ fuel: g.w.fuel / STAGES[stage].prop, info: cfg.info(g), alert: cfg.alert(g) });
    g.telemetry = () => [g.w.t, Math.hypot(g.w.y[0], g.w.y[1]) - R, Math.hypot(g.w.y[2], g.w.y[3])];
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* Vikram's hazard dodge at the 150 m hover (23 Aug 2023)              */
/* ------------------------------------------------------------------ */
export const LHAZARD = {
  id: 'hazard',
  title: 'Dodge the boulders',
  mission: 'Chandrayaan-3',
  agency: 'ISRO',
  year: 2023,
  date: '2023-08-23',
  buttons: ['◀ LEFT', 'RIGHT ▶'],
  button: 'LEFT',
  control: 'two',
  goal: 'The ground below is rocky. Slide sideways to the green safe spot and stop above it before you touch down.',
  guide: ['Vikram is coming down slowly from 150 m. The side thrusters push you left or right.', 'Once moving, you keep sliding (Newton’s first law). Push the other way to stop over the green spot!'],
  fact: 'At about 150 m above the Moon, Vikram paused to scan the ground, saw it was not safe below and moved sideways to a safer spot before landing on 23 August 2023.',
  create() {
    const acc = 0.3; // m/s² sideways from the thrusters
    const sink = 1.6, rate = 3; // m/s down, sim speed
    const side = Math.random() < 0.5 ? -1 : 1;
    const safe = side * (34 + Math.random() * 18), safeW = 12;
    let x = 0, vx = 0, z = 150, t = 0, used = 0;
    const g = shell('hazard', {
      get x() {
        return x;
      },
      get vx() {
        return vx;
      },
      get z() {
        return z;
      },
      safe,
      safeW,
      update(dt, input) {
        if (g.status !== 'play') return;
        const dir = (input.hold ? -1 : 0) + (input.holdB ? 1 : 0);
        g.burning = dir !== 0;
        const n = Math.ceil((dt * rate) / 0.01), h = (dt * rate) / n;
        for (let i = 0; i < n && z > 0; i++) {
          vx += dir * acc * h;
          used += Math.abs(dir) * acc * h;
          x += vx * h;
          z -= sink * h;
          t += h;
        }
        if (z <= 0) {
          const off = Math.abs(x - safe);
          if (off > safeW / 2) return g.lose(`Touched down ${off.toFixed(0)} m from the safe spot, among boulders! Slide over sooner.`);
          if (Math.abs(vx) > 0.8) return g.lose(`Still sliding at ${Math.abs(vx).toFixed(1)} m/s when the legs touched. Push the other way earlier to stop.`);
          return g.win(Math.abs(vx) < 0.15 && off < 2 ? 3 : Math.abs(vx) < 0.3 && off < 3.5 ? 2 : 1, ['Safe touchdown between the boulders!', `Sideways speed: ${Math.abs(vx).toFixed(2)} m/s`, `Distance from the centre of the safe spot: ${off.toFixed(1)} m`]);
        }
      },
      hud: () => ({ fuel: null, info: [['Height', `${Math.max(0, z).toFixed(0)} m`], ['Sideways', `${Math.abs(vx).toFixed(1)} m/s ${vx < -0.05 ? '◀' : vx > 0.05 ? '▶' : ''}`]], alert: z < 25 && Math.abs(x - safe) > safeW / 2 ? 'Not over the safe spot!' : null }),
      scene: () => ({ kind: 'hazard' }),
      bot() {
        const d = safe - x, tLeft = z / sink;
        const want = clamp(d / Math.max(4, tLeft * 0.6), -2.5, 2.5);
        const stopD = (vx * vx) / (2 * acc);
        if (Math.abs(d) < 0.4 && Math.abs(vx) < 0.06) return {};
        const brake = Math.sign(vx) === Math.sign(d) && stopD >= Math.abs(d) - 0.3;
        const target = brake ? 0 : want;
        if (vx < target - 0.04) return { holdB: true };
        if (vx > target + 0.04) return { hold: true };
        return {};
      },
      telemetry: () => [t, Math.max(0, z), Math.abs(vx)],
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* Pragyan rover: drive to the science spot around a crater            */
/* ------------------------------------------------------------------ */
export const LROVER = {
  id: 'pragyan',
  title: 'Drive Pragyan',
  mission: 'Chandrayaan-3',
  agency: 'ISRO',
  year: 2023,
  date: '2023-08-27',
  buttons: ['◀ LEFT', 'RIGHT ▶'],
  button: 'LEFT',
  control: 'two',
  goal: 'Steer Pragyan around the craters to the science spot before the Sun sets on the Moon.',
  guide: ['Pragyan drives at about 1 cm per second, on solar power.', 'Hold LEFT or RIGHT to steer. A crater 4 m wide is right ahead!'],
  fact: 'On 27 August 2023 Pragyan found a 4 m wide crater 3 m ahead. ISRO told it to back up and take a new path. It drove about 100 m before the lunar night began.',
  create() {
    // metres on the ground; time runs 60× faster than real life
    const speed = 0.01, rate = 60, turn = 0.015; // m/s, sim s per real s, rad per sim s
    const goal = [0, 14];
    const craters = [[0.2, 5, 2], [-3.6, 9.8, 1.3], [3.4, 10.5, 1.2]]; // x, y, radius (m): the first is the real 4 m crater
    const rocks = [[1.7, 12.6, 0.3], [-2.2, 12.4, 0.35], [2.6, 3.2, 0.3]];
    const budget = 22; // m of driving left before the lunar night (power and time)
    let x = 0, y = 0, hd = Math.PI / 2, t = 0, dist = 0;
    const g = shell('rover', {
      get x() {
        return x;
      },
      get y() {
        return y;
      },
      get hd() {
        return hd;
      },
      craters,
      rocks,
      goal,
      update(dt, input) {
        if (g.status !== 'play') return;
        const dir = (input.hold ? 1 : 0) - (input.holdB ? 1 : 0);
        g.burning = true;
        const n = Math.ceil(dt * 40), h = (dt * rate) / n;
        for (let i = 0; i < n; i++) {
          hd += dir * turn * h;
          x += Math.cos(hd) * speed * h;
          y += Math.sin(hd) * speed * h;
          dist += speed * h;
          t += h;
          for (const [cx, cy, r] of craters) if (Math.hypot(x - cx, y - cy) < r) return g.lose('Pragyan rolled into a crater! Steer around it, giving it plenty of room.');
          for (const [cx, cy, r] of rocks) if (Math.hypot(x - cx, y - cy) < r + 0.25) return g.lose('Bumped into a rock. Pragyan’s wheels can only climb small stones.');
          if (Math.hypot(x - goal[0], y - goal[1]) < 0.6) {
            return g.win(dist < 15.2 ? 3 : dist < 17 ? 2 : 1, ['Reached the science spot!', `Distance driven: ${dist.toFixed(1)} m (the straight line is 14 m)`]);
          }
          if (Math.abs(x) > 9 || y < -3 || y > 18) return g.lose('Too far from the lander: its radio could lose Pragyan. Stay near the path.');
        }
        if (dist > budget) g.lose('Night fell on the Moon before you arrived, and Pragyan must sleep through the freezing night. Take a shorter path!');
      },
      hud: () => ({ fuel: Math.max(0, 1 - dist / budget), info: [['To the spot', `${Math.hypot(x - goal[0], y - goal[1]).toFixed(1)} m`], ['Driven', `${dist.toFixed(1)} of ${budget} m`]] }),
      scene: () => ({ kind: 'rover' }),
      bot() {
        // aim for waypoints that go around the craters
        const wps = [[-2.6, 4.2], [-1.4, 8.4], [0, 14]];
        const wp = wps.find(([wx, wy]) => y < wy - 0.3) || goal;
        const want = Math.atan2(wp[1] - y, wp[0] - x);
        const e = Math.atan2(Math.sin(want - hd), Math.cos(want - hd));
        return { hold: e > 0.03, holdB: e < -0.03 };
      },
      telemetry: () => [t, Math.hypot(x - goal[0], y - goal[1]), dist],
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* Aditya-L1: balance at the Sun–Earth L1 point (6 Jan 2024)           */
/* ------------------------------------------------------------------ */
export const LL1 = {
  id: 'aditya',
  title: 'Balance at L1',
  mission: 'Aditya-L1',
  agency: 'ISRO',
  year: 2024,
  date: '2024-01-06',
  buttons: ['◀ SUNWARD', 'EARTHWARD ▶'],
  button: 'SUNWARD',
  control: 'two',
  goal: 'Stay in the halo zone around L1 for one full loop (178 days) with as little fuel as you can.',
  guide: ['At L1 the pulls of the Sun and Earth balance, like a ball on top of a hill. Any small drift grows!', 'Tap SUNWARD or EARTHWARD to nudge yourself back onto the dotted loop.'],
  fact: 'Aditya-L1 entered its halo orbit around L1, about 1.5 million km from Earth, on 6 January 2024. It finished its first 178-day loop on 2 July 2024.',
  create() {
    // linearised Sun–Earth circular restricted three-body motion about L1, rotating frame
    // (x towards Earth, y along Earth's motion), units: length = 1.5 million km, time = 1/n (58.1 days)
    const c2 = 4.06, n = 2 * Math.PI / (365.25 * DAY), L = 1.5e9; // m
    const lam = Math.sqrt((c2 - 2 + Math.sqrt(9 * c2 * c2 - 8 * c2)) / 2); // unstable rate
    const om = Math.sqrt((2 - c2 + Math.sqrt(9 * c2 * c2 - 8 * c2)) / 2); // loop frequency
    const kap = (om * om + 1 + 2 * c2) / (2 * om);
    const Ax = 0.14; // loop size in x (≈ 210,000 km)
    const ref = (t) => [-Ax * Math.cos(om * t), kap * Ax * Math.sin(om * t)];
    const f = (s) => [s[2], s[3], 2 * s[3] + (1 + 2 * c2) * s[0], -2 * s[2] - (c2 - 1) * s[1]];
    // start on the loop with a small error, which the instability will grow
    let s = [-Ax + 0.001, 0, 0, kap * Ax * om + 0.0005];
    let t = 0, dv = 0;
    const tEnd = (2 * Math.PI) / om; // one loop
    const kick = 0.0006; // velocity change per nudge, normalised (≈ 1.8 m/s)
    const toMs = (L * n); // normalised velocity → m/s
    const box = [0.6, 0.9];
    const predict = (st, T = 1.1) => {
      const out = [];
      let y = st.slice();
      for (let i = 0; i < 60; i++) {
        y = rk4(f, y, T / 60);
        out.push([y[0], y[1]]);
      }
      return out;
    };
    let pred = predict(s);
    let predAt = -1;
    const g = shell('l1', {
      ref,
      om,
      kap,
      Ax,
      box,
      get s() {
        return s;
      },
      get t() {
        return t;
      },
      get pred() {
        return pred;
      },
      update(dt, input) {
        if (g.status !== 'play') return;
        if (input.tap) ((s[2] -= kick), (dv += kick));
        if (input.tapB) ((s[2] += kick), (dv += kick));
        g.burning = !!(input.tap || input.tapB);
        const h = dt * 0.12; // ≈ 7 days per real second
        const m = 8;
        for (let i = 0; i < m; i++) s = rk4(f, s, h / m);
        t += h;
        if (t - predAt > 0.03 || g.burning) {
          pred = predict(s);
          predAt = t;
        }
        if (Math.abs(s[0]) > box[0] || Math.abs(s[1]) > box[1]) return g.lose(`Drifted out of the halo zone after ${Math.round((t / n) / DAY)} days. Nudge earlier, when the drift is still small.`);
        if (t >= tEnd) {
          const ms = dv * toMs;
          g.win(ms <= 3 ? 3 : ms <= 8 ? 2 : 1, ['One full loop around L1!', `Fuel used: ${ms.toFixed(1)} m/s of Δv`]);
        }
      },
      hud: () => ({ fuel: null, info: [['Day', `${Math.round(t / n / DAY)} of ${Math.round(tEnd / n / DAY)}`], ['Fuel used', `${(dv * toMs).toFixed(1)} m/s`]] }),
      scene: () => ({ kind: 'l1' }),
      bot() {
        // measure the unstable part of the motion (left eigenvector of the linear
        // equations) and cancel it with a nudge when it grows
        const a = 1 + 2 * c2, b = 1 - c2;
        const w4 = (2 * lam) / (lam * lam - b);
        const wv = [a / lam, lam * w4 - 2, 1, w4];
        const r = [-Ax * Math.cos(om * t), kap * Ax * Math.sin(om * t), Ax * om * Math.sin(om * t), kap * Ax * om * Math.cos(om * t)];
        const al = wv.reduce((acc, wi, i) => acc + wi * (s[i] - r[i]), 0);
        // a real finger has to lift between taps
        if (Math.abs(al) < 0.0012 || g._tapped) return ((g._tapped = false), {});
        g._tapped = true;
        return al > 0 ? { tap: true } : { tapB: true };
      },
      telemetry: () => [t / n, Math.hypot(s[0] - ref(t)[0], s[1] - ref(t)[1]) * L, Math.hypot(s[2], s[3]) * toMs],
    });
    void lam;
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* INSAT-3DS: park over India at 82°E (2024)                            */
/* ------------------------------------------------------------------ */
export const LGEO = {
  id: 'insat',
  title: 'Park over India',
  mission: 'INSAT-3DS',
  agency: 'ISRO',
  year: 2024,
  date: '2024-02-17',
  buttons: ['SLOW DOWN', 'SPEED UP'],
  button: 'SLOW DOWN',
  control: 'two',
  goal: 'Stop INSAT-3DS drifting, right over its slot at 82° East, so it hangs still above India.',
  guide: ['Your orbit is a little too low, so you go round faster than Earth spins and drift east.', 'Surprise: SPEED UP lifts your orbit and makes you drift WEST. Stop the drift exactly over 82°E!'],
  fact: 'INSAT-3DS was launched on 17 February 2024 on GSLV-F14. From 36,000 km above 82°E it watches India’s weather day and night.',
  create() {
    const mu = MU.earth, aG = Math.cbrt(mu / (7.2921159e-5) ** 2); // geostationary radius
    const we = 7.2921159e-5, slot = 82;
    let a = aG - 70e3, lon = 74, t = 0, dv = 0, still = 0;
    const acc = 0.0002 * 15; // m/s² (small thrusters), already scaled for game time below
    const rate = 0.5 * DAY; // sim seconds per real second
    const drift = () => ((Math.sqrt(mu / a ** 3) - we) * DAY) / deg; // °/day, + = east
    const g = shell('geo', {
      slot,
      get lon() {
        return lon;
      },
      get a() {
        return a;
      },
      drift,
      update(dt, input) {
        if (g.status !== 'play') return;
        const dir = (input.holdB ? 1 : 0) - (input.hold ? 1 : 0);
        g.burning = dir !== 0;
        const h = dt * rate;
        if (dir) {
          // a small along-track push changes the orbit size: Δa = 2a·Δv/v (circular orbit)
          const d = acc * dt * 60 * dir; // Δv this frame, m/s
          a += (2 * a * d) / Math.sqrt(mu / a);
          dv += Math.abs(d);
        }
        lon += (drift() * h) / DAY;
        t += h;
        const err = Math.abs(lon - slot);
        if (err < 0.5 && Math.abs(drift()) < 0.05) still += h;
        else still = 0;
        if (still > 1.5 * DAY) return g.win(dv <= 3.8 && err < 0.2 ? 3 : dv <= 6 && err < 0.35 ? 2 : 1, [`Parked over ${lon.toFixed(2)}°E!`, `Drift: ${Math.abs(drift()).toFixed(3)}° per day`, `Fuel used: ${dv.toFixed(1)} m/s of Δv`]);
        if (lon > slot + 6) return g.lose('You drifted far past India to the east. Remember: speeding up makes you drift west!');
        if (lon < slot - 14) return g.lose('You drifted too far west. Slowing down lowers the orbit and makes you drift east.');
        if (t > 30 * DAY) return g.lose('A month has passed and you are still drifting. Stop the drift right over 82°E.');
      },
      hud: () => ({ fuel: null, info: [['Position', `${lon.toFixed(1)}°E`], ['Drift', `${drift() >= 0 ? 'east' : 'west'} ${Math.abs(drift()).toFixed(2)}°/day`]] }),
      scene: () => ({ kind: 'geo' }),
      bot() {
        // aim for a drift that brings us to the slot and slows to zero there
        const d = slot - lon;
        const want = clamp(d * (Math.abs(d) < 1.5 ? 0.25 : 0.12), -0.9, 0.9);
        const cur = drift();
        if (Math.abs(d) < 0.05 && Math.abs(cur) < 0.01) return {};
        if (cur > want + 0.015) return { holdB: true };
        if (cur < want - 0.015) return { hold: true };
        return {};
      },
      telemetry: () => [t, Math.abs(lon - slot), Math.abs(drift())],
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* Pushpak RLV-LEX-03: glide in and flare to a soft landing (2024)     */
/* ------------------------------------------------------------------ */
export const LRLV = {
  id: 'pushpak',
  title: 'Land the spaceplane',
  mission: 'RLV-LEX-03 · Pushpak',
  agency: 'ISRO',
  year: 2024,
  date: '2024-06-23',
  button: 'PULL UP',
  control: 'hold',
  goal: 'Pushpak has no engine: it glides. Hold PULL UP near the ground to flare and touch down gently.',
  guide: ['Wings make lift. Pulling up adds lift but costs speed.', 'Glide down steeply to keep your speed, then pull up just above the runway to land softly.'],
  fact: 'On 23 June 2024 a helicopter released Pushpak 4.5 km up. It glided down by itself, landed on the runway at about 320 km/h and stopped with a brake parachute.',
  create() {
    const m = 1750, S = 9.5, cd0 = 0.055, k = 0.11, gEarth = 9.81;
    const rho = (hh) => 1.225 * Math.exp(-hh / 8500);
    const clGlide = 0.33, clPull = 1.0, clMax = 1.15;
    let v = 112, gam = -12 * deg, hgt = 4500, x = 0, cl = clGlide, t = 0;
    const g = shell('glide', {
      get h() {
        return hgt;
      },
      get gam() {
        return gam;
      },
      get v() {
        return v;
      },
      get cl() {
        return cl;
      },
      get x() {
        return x;
      },
      update(dt, input) {
        if (g.status !== 'play') return;
        g.burning = !!input.hold;
        const rate = hgt > 350 ? 16 : hgt > 120 ? 1.6 : 0.6; // slow motion for the flare
        const target = input.hold ? clPull : clGlide;
        const n = Math.ceil((dt * rate) / 0.01), h = (dt * rate) / n;
        for (let i = 0; i < n; i++) {
          cl += clamp(target - cl, -1.6 * h, 1.6 * h); // the elevons respond quickly
          const q = 0.5 * rho(hgt) * v * v * S;
          const lift = q * Math.min(cl, clMax), drag = q * (cd0 + k * cl * cl);
          const st = rk4(
            ([vv, gg]) => [-drag / m - gEarth * Math.sin(gg), (lift / m - gEarth * Math.cos(gg)) / vv],
            [v, gam],
            h,
          );
          v = st[0];
          gam = st[1];
          hgt += v * Math.sin(gam) * h;
          x += v * Math.cos(gam) * h;
          t += h;
          if (v < 50) return g.lose('Stalled! You pulled up too early, too slow to make lift. Keep diving until just above the runway.');
          if (hgt <= 0) {
            const sink = -v * Math.sin(gam);
            if (sink > 4) return g.lose(`Hit the runway sinking at ${sink.toFixed(1)} m/s: too hard. Pull up a little earlier.`);
            return g.win(sink <= 1.2 ? 3 : sink <= 2.2 ? 2 : 1, ['Touchdown on the runway!', `Sinking at ${sink.toFixed(2)} m/s, rolling at ${Math.round(v * 3.6)} km/h`]);
          }
          if (gam > 8 * deg && hgt > 30) return g.lose('Climbing away! Pushpak has no engine, so pulling up too hard wastes your speed.');
        }
      },
      hud: () => ({ fuel: null, info: [['Height', `${Math.max(0, hgt).toFixed(0)} m`], ['Sinking', `${Math.max(0, -v * Math.sin(gam)).toFixed(1)} m/s`]], alert: hgt < 55 && hgt > 3 && -v * Math.sin(gam) > 4 ? 'Flare: pull up!' : null }),
      scene: () => ({ kind: 'glide' }),
      bot() {
        const sink = -v * Math.sin(gam);
        return { hold: hgt < 80 && sink > 0.6 + hgt * 0.2 };
      },
      telemetry: () => [t, Math.max(0, hgt), v],
    });
    return g;
  },
};

export const NEW_LEVELS = [LSRE, LASTRO, LDODGE, LNAVIC, LLAUNCH, LHAZARD, LROVER, LL1, LGEO, LRLV];
