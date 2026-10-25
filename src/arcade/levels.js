/**
 * Quick-play levels. Eight short challenges from real missions, each with ONE
 * main control, all running on real physics (see physics.js, core/lander.js,
 * core/edl.js). Every level has a `bot` that wins it, used by the tests to
 * prove each level can be completed, and by "Watch Vyom do it".
 *
 * Level object API (used by ui/screens/play.js and tests/arcade.test.js):
 *   create() → game with:
 *     update(dtReal, input)   input = { hold, tap, aim }  (aim −1…1)
 *     status                  'play' | 'won' | 'lost'
 *     stars (1–3 when won), reason (text when lost), result (lines when won)
 *     hud()                   { fuel 0–1, info:[[label, value]…] (≤ 2), alert? }
 *     scene()                 drawing description for the renderer
 *     bot()                   the input a good pilot would give now
 */
import { createWorld, bodyState } from './physics.js';
import { MU, RADIUS, AU, DAY, G0 } from '../core/constants.js';
import { Lander } from '../core/lander.js';
import { EntrySim } from '../core/edl.js';
import { NEW_LEVELS } from './levels2.js';

const BODY_NAME = { moon: 'the Moon', mars: 'Mars', jupiter: 'Jupiter', earth: 'Earth', pluto: 'Pluto' };
const km = (m) => m / 1000;
const fmtKm = (m) => `${Math.round(km(m)).toLocaleString('en-US')} km`;
const wetFor = (dry, dv, isp) => dry * Math.exp(dv / (isp * G0));

/** Conic state at true anomaly nu (periapsis along +x, counter-clockwise motion). */
function conicState(mu, rp, e, nu, rot = 0) {
  const p = rp * (1 + e);
  const r = p / (1 + e * Math.cos(nu));
  const vr = Math.sqrt(mu / p) * e * Math.sin(nu);
  const vt = Math.sqrt(mu / p) * (1 + e * Math.cos(nu));
  const a = nu + rot;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: r * c, y: r * s, vx: vr * c - vt * s, vy: vr * s + vt * c };
}

/** Clock: simulated seconds per real second, ∝ local orbital period (slow near planets). */
export const orbitClock = (mu, k) => (r) => (2 * Math.PI * Math.sqrt(r ** 3 / mu)) / k;

/* ------------------------------------------------------------------ */
/* Shared orbital game                                                 */
/* ------------------------------------------------------------------ */
export function orbitalGame(cfg) {
  const w = createWorld(cfg.world);
  const g = {
    kind: 'orbit',
    w,
    status: 'play',
    stars: 0,
    reason: '',
    result: [],
    pred: null,
    predAt: -1,
    realT: 0,
    burning: false,
    trail: [],
    update(dt, input) {
      if (g.status !== 'play') return;
      g.realT += dt;
      cfg.beforeStep?.(g, input);
      const wantBurn = (cfg.alwaysBurn || !!input.hold) && w.fuel > 0 && !g.noEngine;
      g.burning = wantBurn;
      w.burn = wantBurn ? { dir: cfg.dir, ref: cfg.ref ?? null } : null;
      const r = cfg.clockR(g);
      const rate = wantBurn && cfg.burnClock ? cfg.burnClock : cfg.clock(r) * (wantBurn ? cfg.burnSlow ?? 0.5 : 1);
      w.advance(Math.min(dt, 0.05) * rate);
      const last = g.trail[g.trail.length - 1];
      if (!last || Math.hypot(w.y[0] - last[0], w.y[1] - last[1]) > (cfg.trailStep ?? 2e5)) g.trail.push([w.y[0], w.y[1]]);
      if (g.trail.length > 1500) g.trail.splice(0, 500);
      if (g.realT - g.predAt > (wantBurn ? 0.06 : 0.25)) {
        g.pred = w.predict(cfg.horizon(g), 300);
        g.predAt = g.realT;
      }
      if (w.status === 'hit') return cfg.onHit(g, w.hit);
      cfg.check(g);
    },
    win(stars, lines) {
      g.status = 'won';
      g.stars = stars;
      g.result = lines;
      w.burn = null;
    },
    lose(reason) {
      g.status = 'lost';
      g.reason = reason;
      w.burn = null;
    },
    hud: () => ({ fuel: cfg.noFuel ? null : w.fuel / w.fuel0, info: cfg.info(g), alert: cfg.alert?.(g) }),
    /** read-only sample for the debrief graph: [sim time s, height m, speed m/s] */
    telemetry: () => [w.t, Math.hypot(w.y[0], w.y[1]) - (cfg.world.central.R || 0), Math.hypot(w.y[2], w.y[3])],
    scene: () => cfg.scene(g),
    bot: () => cfg.bot(g),
  };
  g.pred = w.predict(cfg.horizon(g), 300);
  return g;
}

/* ------------------------------------------------------------------ */
/* 1. Raise the orbit (Chandrayaan-3)                                  */
/* ------------------------------------------------------------------ */
const L1 = {
  id: 'raise',
  title: 'Raise the orbit',
  mission: 'Chandrayaan-3',
  agency: 'ISRO',
  year: 2023,
  date: '2023-07-15',
  button: 'BOOST',
  control: 'hold',
  goal: 'Push the far end of your orbit out to the green ring.',
  guide: ['Hold BOOST to fire the engine forwards.', 'Tip: burn when you are closest to Earth. The engine works best there!'],
  fact: 'Chandrayaan-3 raised its orbit five times, always burning near perigee, before heading for the Moon.',
  create() {
    const mu = MU.earth, R = 6378e3;
    const rp = R + 170e3, ra = R + 36500e3;
    const e = (ra - rp) / (ra + rp);
    const s = conicState(mu, rp, e, (-120 * Math.PI) / 180, -Math.PI / 2);
    const target = R + 70000e3;
    const dry = 2204, isp = 315;
    const world = { central: { name: 'earth', mu, R }, bodies: [], ship: { ...s, mass: wetFor(dry, 900, isp), dry, thrust: 440, isp }, hmax: 600 };
    let started = false;
    return orbitalGame({
      world,
      dir: 'pro',
      clock: orbitClock(mu, 9),
      clockR: (g) => Math.hypot(g.w.y[0], g.w.y[1]),
      horizon: (g) => Math.min(3 * DAY, g.w.orbitAbout('earth').period || DAY),
      check(g) {
        const o = g.w.orbitAbout('earth');
        if (g.burning) started = true;
        if (!g.burning && o.apo >= target) {
          const dv = g.w.dvUsed;
          return g.win(dv <= 360 ? 3 : dv <= 460 ? 2 : 1, [`Far point: ${fmtKm(o.apo - R)} up`, `Fuel used: ${Math.round(dv)} m/s of Δv`]);
        }
        if (g.w.fuel <= 0 && !g.burning) return g.lose('Out of fuel before reaching the ring. Burn closer to Earth, where each push counts most.');
        if (g.w.t > 3.2 * DAY && !started) return g.lose('You never fired the engine! Hold BOOST as you swing close to Earth.');
        if (g.w.t > 5 * DAY) return g.lose('Time is up. Burn when you are closest to Earth.');
      },
      onHit: (g) => g.lose('Crashed into Earth.'),
      info(g) {
        const o = g.w.orbitAbout('earth');
        return [['Far point', fmtKm(o.apo - R)], ['Goal', fmtKm(target - R)]];
      },
      scene: (g) => ({ central: 'earth', bodies: [], keepWide: true, rings: [{ body: 'earth', r: target, label: 'Goal' }], focus: [[0, 0], [g.w.y[0], g.w.y[1]], [target, 0], [-target, 0], [0, target * 0.6], [0, -target * 0.6]] }),
      bot(g) {
        const o = g.w.orbitAbout('earth');
        const near = o.r < rp * 1.6;
        return { hold: near && o.apo < target * 1.01 };
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* 2. Moon shot (Chandrayaan-3 trans-lunar injection)                  */
/* ------------------------------------------------------------------ */
const L2 = {
  id: 'moonshot',
  title: 'Moon shot',
  mission: 'Chandrayaan-3',
  agency: 'ISRO',
  year: 2023,
  date: '2023-08-01',
  button: 'BOOST',
  control: 'hold',
  goal: 'Stretch your path until it reaches the green zone around the Moon.',
  guide: ['The Moon is moving! Your dotted path shows where you will go.', 'Hold BOOST near Earth until the dotted line touches the Moon zone.'],
  fact: 'On 1 August 2023 Chandrayaan-3 fired its engine at perigee and left Earth orbit for the Moon.',
  create() {
    const mu = MU.earth, R = 6378e3;
    const rp = R + 290e3, ra = R + 127600e3;
    const e = (ra - rp) / (ra + rp);
    const s = conicState(mu, rp, e, (-110 * Math.PI) / 180, -Math.PI / 2);
    const aMoon = 384400e3;
    const zone = 40000e3;
    // place the Moon where a ~190 m/s burn around perigee will meet it (computed, not scripted):
    // fly the same engine the player has, burning while close to Earth
    const dry = 2204, isp = 315;
    const cal = createWorld({ central: { name: 'earth', mu, R }, bodies: [], ship: { ...s, mass: wetFor(dry, 420, isp), dry, thrust: 440, isp }, hmax: 600 });
    {
      const nearR = rp * 1.35;
      for (let i = 0; i < 20000 && cal.dvUsed < 190; i++) {
        const near = Math.hypot(cal.y[0], cal.y[1]) < nearR;
        cal.burn = near ? { dir: 'pro' } : null;
        cal.advance(near ? 20 : 300);
      }
      cal.burn = null;
      for (let i = 0; i < 20000 && Math.hypot(cal.y[0], cal.y[1]) < aMoon - 25000e3; i++) cal.advance(600);
    }
    const tm = cal.t, thM = Math.atan2(cal.y[1], cal.y[0]);
    const wM = Math.sqrt((mu + MU.moon) / aMoon ** 3);
    const moon = { name: 'moon', mu: MU.moon, R: 1737.4e3, a: aMoon, phase0: thM + 0.05 - wM * tm };
    const world = { central: { name: 'earth', mu, R }, bodies: [moon], ship: { ...s, mass: wetFor(dry, 420, isp), dry, thrust: 440, isp }, hmax: 900 };
    let wentHigh = false;
    return orbitalGame({
      world,
      dir: 'pro',
      clock: orbitClock(mu, 9),
      clockR: (g) => Math.hypot(g.w.y[0], g.w.y[1]),
      horizon: () => 7 * DAY,
      trailStep: 1e6,
      check(g) {
        const m = g.w.rel('moon');
        const d = Math.hypot(m.x, m.y);
        const r = Math.hypot(g.w.y[0], g.w.y[1]);
        if (d < zone) {
          const dv = g.w.dvUsed;
          return g.win(dv <= 205 ? 3 : dv <= 250 ? 2 : 1, ['You reached the Moon!', `Fuel used: ${Math.round(dv)} m/s of Δv`]);
        }
        if (r > 200000e3) wentHigh = true;
        const o = g.w.orbitAbout('earth');
        if (wentHigh && o.radialV < 0 && r < 300000e3) return g.lose('You missed the Moon and are falling back to Earth. Watch the dotted line!');
        if (r > 900000e3) return g.lose('Too much speed: you flew off into deep space.');
        if (g.w.t > 14 * DAY) return g.lose('Time is up.');
      },
      onHit: (g, b) => g.lose(b === 'moon' ? 'You crashed into the Moon. Aim for the zone, not the surface!' : 'Crashed into Earth.'),
      info(g) {
        const c = g.pred?.closest?.moon;
        return [['Closest to Moon', c ? fmtKm(Math.max(0, c.d - 1737e3)) : '—'], ['Goal', `< ${fmtKm(zone)}`]];
      },
      scene: (g) => ({ central: 'earth', bodies: ['moon'], keepWide: true, rings: [{ body: 'moon', r: zone, label: 'Moon zone' }], showOrbit: ['moon'], focus: [[0, 0], [g.w.y[0], g.w.y[1]], [aMoon, 0], [-aMoon, 0], [0, aMoon], [0, -aMoon]] }),
      bot(g) {
        const o = g.w.orbitAbout('earth');
        const c = g.pred?.closest?.moon;
        const near = o.r < rp * 1.35;
        return { hold: near && !(c && c.d < zone * 0.6) && o.apo < aMoon * 1.1 };
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* Capture helper: brake at closest approach to be caught (Moon, Mars) */
/* ------------------------------------------------------------------ */
function captureLevel({ body, mu, R, vInf, periAlt, startR, dry, wetDv, thrust, isp, apoMax, periMin, starsBy, info2, botApo = 0.25 }) {
  const rp = R + periAlt;
  const e = 1 + (rp * vInf * vInf) / mu;
  const p = rp * (1 + e);
  const nu0 = -Math.acos((p / startR - 1) / e);
  const s = conicState(mu, rp, e, nu0, Math.PI / 2);
  const world = { central: { name: body, mu, R }, bodies: [], ship: { ...s, mass: wetFor(dry, wetDv, isp), dry, thrust, isp }, hmax: 300 };
  let anglePast = 0;
  let lastAng = Math.atan2(s.y, s.x);
  return orbitalGame({
    world,
    dir: 'retro',
    clock: orbitClock(mu, 10),
    clockR: (g) => Math.hypot(g.w.y[0], g.w.y[1]),
    burnSlow: 0.3, // time slows right down while you brake, so you can let go at the right moment
    horizon: () => {
      return 2 * Math.PI * Math.sqrt(startR ** 3 / mu) * 0.6;
    },
    trailStep: 5e4,
    check(g) {
      const ang = Math.atan2(g.w.y[1], g.w.y[0]);
      let d = ang - lastAng;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      anglePast += d;
      lastAng = ang;
      // judge once we're well past the closest point (≈100° beyond it)
      const nuNow = nu0 + anglePast;
      if (nuNow < (100 * Math.PI) / 180 || g.burning) return;
      const o = g.w.orbitAbout(body);
      const apoAlt = o.apo - R, periAlt2 = o.peri - R;
      if (o.energy >= 0) return g.lose(`Not caught: you flew past ${BODY_NAME[body]}. Hold BRAKE longer near the closest point.`);
      if (periAlt2 < periMin) return g.lose('Your orbit dips too low: it would hit the surface. Brake a little less.');
      if (apoAlt > apoMax) return g.lose(`Caught, but the orbit is too stretched (far point ${fmtKm(apoAlt)}). Brake a bit more.`);
      return g.win(starsBy(g, apoAlt), [`Orbit: ${fmtKm(periAlt2)} × ${fmtKm(apoAlt)}`, `Fuel used: ${Math.round(g.w.dvUsed)} m/s of Δv`]);
    },
    onHit: (g) => g.lose(`Crashed into ${BODY_NAME[body]}! Brake less, or check your path.`),
    info(g) {
      const o = g.w.orbitAbout(body);
      return [['Height', fmtKm(o.r - R)], info2(o)];
    },
    scene: (g) => ({ central: body, bodies: [], rings: [{ body, r: R + apoMax, label: 'Capture zone', dashed: true }], focus: [[0, 0], [g.w.y[0], g.w.y[1]], [R * 3, 0], [-R * 3, 0]] }),
    bot(g) {
      const o = g.w.orbitAbout(body);
      return { hold: o.r < rp * 1.6 && (o.energy >= 0 || o.apo - R > apoMax * botApo) };
    },
  });
}

/* 3. Catch the Moon (lunar orbit insertion) */
const L3 = {
  id: 'catchmoon',
  title: 'Catch the Moon',
  mission: 'Chandrayaan-3',
  agency: 'ISRO',
  year: 2023,
  date: '2023-08-05',
  button: 'BRAKE',
  control: 'hold',
  goal: 'Brake so the Moon’s gravity catches you in orbit.',
  guide: ['You are falling past the Moon too fast to stay.', 'Hold BRAKE near the closest point. Brake more for a rounder orbit, but don’t crash!'],
  fact: 'On 5 August 2023 Chandrayaan-3 braked for about 30 minutes and was captured by the Moon.',
  create: () =>
    captureLevel({
      body: 'moon',
      mu: MU.moon,
      R: 1737.4e3,
      vInf: 850,
      periAlt: 500e3,
      startR: 22000e3,
      dry: 2204,
      wetDv: 900,
      thrust: 440,
      isp: 315,
      apoMax: 20000e3,
      periMin: 15e3,
      starsBy: (g, apo) => (apo <= 5500e3 ? 3 : apo <= 10000e3 ? 2 : 1),
      info2: (o) => ['Orbit', o.energy < 0 ? 'Caught!' : 'Flying past'],
    }),
};

/* ------------------------------------------------------------------ */
/* Vertical landers                                                    */
/* ------------------------------------------------------------------ */
function landerLevel({ g, engine, mass, dry, z0, vz0, speed = 1, holdThrottle, idleThrottle = 0, limits, stars, surface, crane = false }) {
  const l = new Lander({ g, engine, mass, dryMass: dry, x: 0, z: z0, vx: 0, vz: vz0, pitch: 0, pitchRate: 0, maxPitch: 0, limits, terrain: { base: 0 }, footprint: 2 });
  const game = {
    kind: 'lander',
    l,
    surface,
    crane,
    status: 'play',
    stars: 0,
    reason: '',
    result: [],
    burning: false,
    update(dt, input) {
      if (game.status !== 'play') return;
      const thr = typeof holdThrottle === 'function' ? holdThrottle(l) : holdThrottle;
      l.throttleCmd = input.hold && l.fuel > 0 ? thr : idleThrottle;
      game.burning = l.thrust() > 0;
      const steps = Math.ceil((dt * speed) / 0.01);
      for (let i = 0; i < steps && l.status === 'flying'; i++) l.step((dt * speed) / steps);
      if (l.status === 'landed') {
        const v = l.touch.vz;
        game.status = 'won';
        game.stars = stars(v);
        game.result = [`Touchdown at ${v.toFixed(2)} m/s`, `Fuel left: ${Math.round(l.fuel)} kg`];
      } else if (l.status === 'crashed') {
        game.status = 'lost';
        game.reason = `Touched down at ${l.touch.vz.toFixed(1)} m/s: too fast (safe is under ${limits.vz} m/s). Start braking earlier!`;
      } else if (l.altitude > z0 + 600) {
        game.status = 'lost';
        game.reason = 'You flew back up into space! Use shorter bursts.';
      }
    },
    hud: () => ({
      fuel: l.fuel / (mass - dry),
      info: [['Height', `${Math.max(0, l.altitude).toFixed(0)} m`], ['Speed', `${Math.abs(l.vz).toFixed(1)} m/s ${l.vz < -0.05 ? '↓' : l.vz > 0.05 ? '↑' : ''}`]],
      alert: l.altitude < 60 && l.vz < -limits.vz * 1.5 ? 'Too fast! Brake!' : l.fuel <= 0 ? 'Out of fuel!' : null,
    }),
    scene: () => ({ kind: 'lander', surface, z0, crane }),
    /** height where you would stop if you held the engine from now on (null if you never would) */
    stopAlt() {
      const aNet = (engine.thrust * (typeof holdThrottle === 'function' ? holdThrottle(l) : holdThrottle)) / l.mass - g;
      const v = -l.vz;
      if (v <= 0.2 || aNet <= 0) return null;
      return l.altitude - (v * v) / (2 * aNet);
    },
    telemetry: () => [l.t, Math.max(0, l.altitude), Math.abs(l.vz)],
    bot() {
      // brake when the engine's real stopping distance (with margin) reaches the ground
      const aNet = (engine.thrust * (typeof holdThrottle === 'function' ? holdThrottle(l) : holdThrottle)) / l.mass - g;
      const v = -l.vz;
      const stop = v > 0 ? (v * v) / (2 * Math.max(0.05, aNet)) : 0;
      const target = Math.max(0.5, Math.min(limits.vz * 0.5, l.altitude * 0.1));
      // a careful pilot: start braking early and come down slowly at the end
      return { hold: (stop + 4 > l.altitude * 0.7 && v > target) || v > 1.5 + l.altitude * 0.18 };
    },
  };
  return game;
}

/* 4. Vikram at the south pole */
const L4 = {
  id: 'vikram',
  title: 'Vikram touchdown',
  mission: 'Chandrayaan-3',
  agency: 'ISRO',
  year: 2023,
  date: '2023-08-23',
  button: 'ENGINE',
  control: 'hold',
  goal: 'Land gently: under 3 m/s.',
  guide: ['The Moon pulls you down, with no air to slow you.', 'Hold ENGINE to push up. Short taps near the ground give a soft landing.'],
  fact: 'Vikram landed near the Moon’s south pole on 23 August 2023, making India the first country to land there.',
  create: () =>
    landerLevel({
      g: 1.62,
      engine: { thrust: 3200, isp: 300, minThrottle: 0.4 },
      mass: 1380,
      dry: 1250,
      z0: 800,
      vz0: -12,
      speed: 1.6,
      holdThrottle: 1,
      limits: { vz: 3, vx: 1, tilt: 15 },
      stars: (v) => (v <= 0.8 ? 3 : v <= 1.6 ? 2 : 1),
      surface: 'moon',
    }),
};

/* ------------------------------------------------------------------ */
/* 5. Mars launch window (Mangalyaan)                                  */
/* ------------------------------------------------------------------ */
const L5 = {
  id: 'window',
  title: 'Launch window',
  mission: 'Mangalyaan',
  agency: 'ISRO',
  year: 2013,
  date: '2013-11-05',
  button: 'LAUNCH',
  control: 'tap',
  goal: 'Launch when Mars is about 44° ahead of Earth, so you arrive where Mars will be.',
  guide: ['Mars moves while you fly: the trip takes about 300 days.', 'Tap LAUNCH when the angle is close to 44°. This chance comes only once every 26 months!'],
  fact: 'Mangalyaan left Earth on 1 December 2013 in exactly such a window, and reached Mars on its first try.',
  create() {
    const mu = MU.sun;
    const aE = AU, aM = 1.5237 * AU;
    const wE = Math.sqrt(mu / aE ** 3), wM = Math.sqrt(mu / aM ** 3);
    const earth = { name: 'earth', mu: 0, R: 6371e3, a: aE, phase0: 0 };
    const mars = { name: 'mars', mu: 0, R: 3389.5e3, a: aM, phase0: (57 * Math.PI) / 180 };
    const at = (aE + aM) / 2;
    const vp = Math.sqrt(mu * (2 / aE - 1 / at));
    const tTransfer = Math.PI * Math.sqrt(at ** 3 / mu);
    const ideal = Math.PI - wM * tTransfer; // phase angle Mars–Earth at launch
    const world = { central: { name: 'sun', mu, R: 695700e3 }, bodies: [earth, mars], ship: { x: aE, y: 0, vx: 0, vy: aE * wE, mass: 1000, dry: 999, thrust: 0, isp: 300 }, hmax: DAY };
    let launched = false, launchT = 0, best = Infinity, launchPhase = 0;
    const phaseNow = (t) => {
      let d = (mars.phase0 + wM * t) - wE * t;
      d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      return d;
    };
    const g = orbitalGame({
      world,
      noFuel: true,
      dir: 'pro',
      clock: () => (launched ? 20 : 2.6) * DAY,
      clockR: () => 0,
      horizon: () => (launched ? 1 : 0.0001) * tTransfer,
      trailStep: 2e9,
      beforeStep(gg, input) {
        gg.noEngine = true;
        if (!launched) {
          const p = bodyState(gg.w.body('earth'), gg.w.t, {});
          gg.w.y[0] = p.x;
          gg.w.y[1] = p.y;
          gg.w.y[2] = p.vx;
          gg.w.y[3] = p.vy;
          if (input.tap) {
            launched = true;
            launchT = gg.w.t;
            launchPhase = phaseNow(gg.w.t);
            const v = Math.hypot(p.vx, p.vy);
            gg.w.y[2] = (p.vx / v) * vp;
            gg.w.y[3] = (p.vy / v) * vp;
            gg.launched = true;
          }
        }
      },
      check(gg) {
        if (!launched) {
          if (phaseNow(gg.w.t) < ideal - (25 * Math.PI) / 180) gg.lose('The window closed: Mars got too far behind. The next chance is 26 months away!');
          return;
        }
        const m = gg.w.rel('mars');
        best = Math.min(best, Math.hypot(m.x, m.y));
        if (gg.w.t - launchT > tTransfer * 1.02) {
          const deg = ((launchPhase - ideal) * 180) / Math.PI;
          if (best > 15e9) return gg.lose(`Missed Mars by ${fmtKm(best)}. You launched with Mars ${((launchPhase * 180) / Math.PI).toFixed(0)}° ahead; ${deg > 0 ? 'wait a little longer' : 'launch a bit sooner'} next time.`);
          return gg.win(best < 1e9 ? 3 : best < 4e9 ? 2 : 1, [`Arrived ${fmtKm(best)} from Mars`, `Launch angle: ${((launchPhase * 180) / Math.PI).toFixed(1)}° (best ≈ ${((ideal * 180) / Math.PI).toFixed(0)}°)`]);
        }
      },
      onHit: (gg) => gg.lose('Flew into the Sun!'),
      info(gg) {
        if (!launched) return [['Mars ahead by', `${((phaseNow(gg.w.t) * 180) / Math.PI).toFixed(1)}°`], ['Best', `≈ ${((ideal * 180) / Math.PI).toFixed(0)}°`]];
        return [['Days flown', `${Math.round((gg.w.t - launchT) / DAY)}`], ['Mars distance', fmtKm(Math.hypot(gg.w.rel('mars').x, gg.w.rel('mars').y))]];
      },
      scene: (gg) => ({ central: 'sun', bodies: ['earth', 'mars'], showOrbit: ['earth', 'mars'], angle: !launched ? { a: 'earth', b: 'mars', ideal } : null, shipHidden: !launched, focus: [[aM * 1.05, 0], [-aM * 1.05, 0], [0, aM * 1.05], [0, -aM * 1.05]], minR: { sun: 9, earth: 5, mars: 5 } }),
      bot(gg) {
        return { tap: !launched && phaseNow(gg.w.t) <= ideal + 0.002 };
      },
    });
    return g;
  },
};

/* 6. Mars capture (Mangalyaan) */
const L6 = {
  id: 'marscapture',
  title: 'Mars orbit insertion',
  mission: 'Mangalyaan',
  agency: 'ISRO',
  year: 2014,
  date: '2014-09-24',
  button: 'BRAKE',
  control: 'hold',
  goal: 'Brake to be caught by Mars, using as little fuel as you can.',
  guide: ['Mangalyaan had very little fuel. Every drop counts!', 'Hold BRAKE as you pass closest to Mars, and stop once you are caught.'],
  fact: 'On 24 September 2014 Mangalyaan braked for 23 minutes. India became the first nation to reach Mars orbit on its first attempt.',
  create: () =>
    captureLevel({
      body: 'mars',
      mu: MU.mars,
      R: 3389.5e3,
      vInf: 2200,
      periAlt: 450e3,
      startR: 60000e3,
      dry: 482.5,
      wetDv: 1700,
      thrust: 440,
      isp: 315,
      apoMax: 80000e3,
      periMin: 150e3,
      starsBy: (g) => (g.w.dvUsed <= 700 ? 3 : g.w.dvUsed <= 850 ? 2 : 1),
      botApo: 0.85,
      info2: (o) => ['Far point', o.energy < 0 ? fmtKm(o.apo - 3389.5e3) : 'not caught yet'],
    }),
};

/* ------------------------------------------------------------------ */
/* 7. Seven minutes of terror (Perseverance)                           */
/* ------------------------------------------------------------------ */
const L7 = {
  id: 'terror',
  title: 'Seven minutes of terror',
  mission: 'Perseverance',
  agency: 'NASA',
  year: 2021,
  date: '2021-02-18',
  button: 'PARACHUTE',
  control: 'tap+hold',
  goal: 'Open the parachute in its safe window, then land gently with the engines.',
  guide: ['First the air slows you down. Then tap PARACHUTE when the light turns green!', 'Too early and it rips; too late and it can’t slow you. Then hold ENGINE to land softly.'],
  fact: 'Perseverance landed in Jezero Crater on 18 February 2021. The parachute opened at almost twice the speed of sound.',
  create() {
    const def = {
      entry: { alt: 125000, v: 5420, gammaDeg: -15.5, mass: 3440 },
      aero: { cd: 1.65, area: 15.9, ld: 0.24, noseRadius: 1.125 },
      chute: { cd: 0.62, area: 363, maxMach: 2.2, minMach: 1.1, maxQ: 850, shieldSepDelay: 20, shieldMass: 440 },
      backshellAlt: 2100,
    };
    const e = new EntrySim(def);
    e.liftUp = 0.6;
    let phase = 'entry';
    let land = null;
    const game = {
      kind: 'edl',
      e,
      status: 'play',
      stars: 0,
      reason: '',
      result: [],
      burning: false,
      get phase() {
        return phase;
      },
      get button() {
        return phase === 'land' ? 'ENGINE' : 'PARACHUTE';
      },
      get control() {
        return phase === 'land' ? 'hold' : 'tap';
      },
      window: () => e.chuteWindow(),
      update(dt, input) {
        if (game.status !== 'play') return;
        if (phase === 'entry' || phase === 'chute') {
          if (phase === 'entry' && input.tap) {
            const w = e.chuteWindow();
            if (w.ok) {
              e.deployChute();
              phase = 'chute';
            } else if (w.why === 'tooSlow') {
              game.status = 'lost';
              game.reason = 'Too late! Below Mach 1.1 the parachute can’t slow you enough in time.';
              return;
            } else {
              e.deployChute();
              game.status = 'lost';
              game.reason = 'Too early! At that speed the air tears the parachute apart. Wait for the green light.';
              return;
            }
          }
          const speed = phase === 'entry' ? 22 : 8;
          const n = Math.ceil((dt * speed) / 0.05);
          for (let i = 0; i < n; i++) e.step((dt * speed) / n);
          if (phase === 'entry' && e.chuteWindow().why === 'tooSlow') {
            game.status = 'lost';
            game.reason = 'You missed the parachute window (Mach 2.2 to 1.1). Tap as soon as the light is green!';
            return;
          }
          if (e.phase === 'failed') {
            game.status = 'lost';
            game.reason = 'The capsule hit the ground.';
            return;
          }
          if (e.phase === 'handover') {
            const hs = e.handoverState();
            land = landerLevel({
              g: 3.721,
              engine: { thrust: 24800, isp: 220, minThrottle: 0.13 },
              mass: 2100,
              dry: 1700,
              z0: hs.alt,
              vz0: hs.vz,
              speed: 1.4,
              holdThrottle: (l) => Math.min(1, (l.mass * (3.721 + 3.2)) / 24800),
              idleThrottle: 0.13,
              limits: { vz: 2.5, vx: 2, tilt: 20 },
              stars: (v) => (v <= 0.9 ? 3 : v <= 1.6 ? 2 : 1),
              surface: 'mars',
              crane: true,
            });
            phase = 'land';
          }
          return;
        }
        land.update(dt, input);
        game.burning = input.hold;
        if (land.status !== 'play') {
          game.status = land.status;
          game.stars = land.stars;
          game.reason = land.reason;
          game.result = land.status === 'won' ? ['Touchdown on Mars!', ...land.result] : [];
        }
      },
      hud() {
        if (phase === 'land') return land.hud();
        const w = e.chuteWindow();
        return {
          fuel: null,
          info: [['Speed', `Mach ${e.mach.toFixed(1)}`], ['Height', `${(e.alt / 1000).toFixed(1)} km`]],
          light: phase === 'entry' ? (w.ok ? 'go' : w.why === 'tooSlow' ? 'late' : 'wait') : 'open',
        };
      },
      scene: () => (phase === 'land' ? land.scene() : { kind: 'edl', phase }),
      telemetry: () => (phase === 'land' ? [e.t + land.l.t, Math.max(0, land.l.altitude), Math.abs(land.l.vz)] : [e.t, Math.max(0, e.alt), e.s.v]),
      get land() {
        return land;
      },
      bot() {
        if (phase === 'entry') return { tap: e.chuteWindow().ok && e.mach < 2.0 };
        if (phase === 'land') return land.bot();
        return {};
      },
    };
    return game;
  },
};

/* ------------------------------------------------------------------ */
/* 8. Jupiter slingshot (Voyager 2)                                    */
/* ------------------------------------------------------------------ */
const L8 = {
  id: 'slingshot',
  title: 'Jupiter slingshot',
  mission: 'Voyager 2',
  agency: 'NASA',
  year: 1979,
  date: '1979-07-09',
  button: 'LAUNCH',
  control: 'aim+tap',
  goal: 'Aim so Jupiter’s gravity flings you on to Saturn.',
  guide: ['Your rocket alone can’t reach Saturn. Borrow speed from Jupiter!', 'Slide to aim, then tap LAUNCH. Watch how Jupiter bends your path, and try again.'],
  fact: 'Voyager 2 used Jupiter in 1979 to reach Saturn in 1981, then Uranus and Neptune: the Grand Tour.',
  create() {
    const mu = MU.sun;
    const aJ = 5.2026 * AU, aS = 9.5549 * AU;
    const v0 = Math.sqrt(mu * (2 / AU - 1 / ((AU + 5.6 * AU) / 2)));
    const AIM = (0.15 * Math.PI) / 180; // slider ±1 → ±0.15° launch direction
    const launchState = (aim) => {
      const a = aim * AIM;
      return { x: AU, y: 0, vx: -v0 * Math.sin(a), vy: v0 * Math.cos(a) };
    };
    // 1) Sun-only flight: where/when the path crosses Jupiter's orbit
    const sunOnly = createWorld({ central: { name: 'sun', mu, R: 695700e3 }, bodies: [], ship: { ...launchState(0), mass: 1, dry: 1, thrust: 0, isp: 1 }, hmax: DAY });
    while (Math.hypot(sunOnly.y[0], sunOnly.y[1]) < aJ) sunOnly.advance(DAY);
    const tJ = sunOnly.t, thJ = Math.atan2(sunOnly.y[1], sunOnly.y[0]);
    const wJ = Math.sqrt((mu + MU.jupiter) / aJ ** 3);
    // Jupiter a little ahead of the crossing point, so the ship passes behind it and gains speed
    const jup = { name: 'jupiter', mu: MU.jupiter, R: RADIUS.jupiter, a: aJ, phase0: thJ + 0.012 - wJ * tJ };
    // 2) with Jupiter: which aims get flung out past Saturn's orbit? Put Saturn where the middle one crosses it.
    const cross = (aim) => {
      const pw = createWorld({ central: { name: 'sun', mu, R: 695700e3 }, bodies: [jup], ship: { ...launchState(aim), mass: 1, dry: 1, thrust: 0, isp: 1 }, hmax: DAY });
      for (let i = 0; i < 1400 && pw.status === 'flying'; i++) {
        pw.advance(2 * DAY);
        if (Math.hypot(pw.y[0], pw.y[1]) >= aS) return { t: pw.t, th: Math.atan2(pw.y[1], pw.y[0]) };
      }
      return null;
    };
    const good = [];
    for (let a = -1; a <= 1.0001; a += 0.05) if (cross(a)) good.push(a);
    const ref = good.length ? good[Math.floor(good.length / 2)] : 0;
    const c = cross(ref) || { t: 1600 * DAY, th: 0 };
    const tS = c.t, thS = c.th;
    const wS = Math.sqrt((mu + MU.saturn) / aS ** 3);
    const sat = { name: 'saturn', mu: MU.saturn, R: RADIUS.saturn, a: aS, phase0: thS - wS * tS };
    const world = { central: { name: 'sun', mu, R: 695700e3 }, bodies: [jup, sat], ship: { ...launchState(0), mass: 722, dry: 690, thrust: 0, isp: 220 }, hmax: DAY };
    let launched = false, aim = 0, best = Infinity, launchT = 0;
    const zone = 0.25 * AU;
    const g = orbitalGame({
      world,
      noFuel: true,
      dir: 'pro',
      clock: () => (launched ? 70 : 0) * DAY,
      clockR: () => 0,
      horizon: () => (launched ? 2 * 365 * DAY : tS * 1.05),
      trailStep: 5e9,
      beforeStep(gg, input) {
        gg.noEngine = true;
        if (!launched) {
          aim = input.aim ?? 0;
          const s = launchState(aim);
          gg.w.y[0] = s.x;
          gg.w.y[1] = s.y;
          gg.w.y[2] = s.vx;
          gg.w.y[3] = s.vy;
          gg.w.t = 0;
          if (input.tap) {
            launched = true;
            launchT = 0;
            gg.launched = true;
          }
          gg.predAt = -1; // refresh the dotted path as the aim changes
        }
      },
      check(gg) {
        if (!launched) return;
        const s = gg.w.rel('saturn');
        const d = Math.hypot(s.x, s.y);
        // inside the zone: judge at the closest pass (when the distance starts growing again)
        if (best < zone && d > best) return gg.win(best < 0.035 * AU ? 3 : best < 0.08 * AU ? 2 : 1, ['Saturn reached!', `Closest pass: ${(best / AU).toFixed(3)} AU (${fmtKm(best)})`]);
        best = Math.min(best, d);
        const r = Math.hypot(gg.w.y[0], gg.w.y[1]);
        if (gg.w.t - launchT > tS * 1.25 || r > aS * 1.6) return gg.lose(`Missed Saturn by ${(best / AU).toFixed(2)} AU. Change your aim a little and try again.`);
      },
      onHit: (gg, b) => gg.lose(b === 'sun' ? 'Lost in the Sun!' : `You crashed into ${b[0].toUpperCase() + b.slice(1)}! Change your aim a little.`),
      info(gg) {
        return launched ? [['Year', `${(1977 + (gg.w.t - launchT) / (365.25 * DAY)).toFixed(1)}`], ['To Saturn', `${(Math.hypot(gg.w.rel('saturn').x, gg.w.rel('saturn').y) / AU).toFixed(2)} AU`]] : [['Aim', `${(aim * 0.15).toFixed(3)}°`], ['Goal', 'reach Saturn']];
      },
      scene: (gg) => ({ central: 'sun', bodies: ['jupiter', 'saturn'], showOrbit: ['jupiter', 'saturn'], rings: [{ body: 'saturn', r: zone, label: 'Saturn zone', fixedPx: false }], predShort: !launched, focus: [[aS * 1.05, 0], [-aS * 1.05, 0], [0, aS * 1.05], [0, -aS * 1.05]], minR: { sun: 8, jupiter: 7, saturn: 6 } }),
      bot(gg) {
        return { aim: ref, tap: !launched && gg.realT > 0.3 };
      },
    });
    g.refAim = ref;
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* 9. Vikram's hop (Chandrayaan-3 hop experiment, 3 Sept 2023)          */
/* ------------------------------------------------------------------ */
const LHOP = {
  id: 'hop',
  title: 'Vikram’s hop',
  mission: 'Chandrayaan-3',
  agency: 'ISRO',
  year: 2023,
  date: '2023-09-03',
  button: 'ENGINE',
  control: 'hold',
  goal: 'Lift Vikram at least 40 cm off the Moon, then land gently again.',
  guide: ['Vikram is already on the Moon. Can it fly again?', 'Hold ENGINE to rise, let go to fall, and tap it again just before touchdown.'],
  fact: 'On 3 September 2023 Vikram fired its engines, rose about 40 cm and landed 30–40 cm away: a test for future missions that must lift off from the Moon.',
  create() {
    const g = 1.62, engine = { thrust: 3200, isp: 300, minThrottle: 0.4 }, mass = 1300, dry = 1250;
    const l = new Lander({ g, engine, mass, dryMass: dry, x: 0, z: 0, vx: 0, vz: 0, pitch: 0, pitchRate: 0, maxPitch: 0, limits: { vz: 2, vx: 1, tilt: 15 }, terrain: { base: 0 }, footprint: 2 });
    let lifted = false, peak = 0;
    const game = {
      kind: 'lander',
      l,
      status: 'play',
      stars: 0,
      reason: '',
      result: [],
      burning: false,
      update(dt, input) {
        if (game.status !== 'play') return;
        l.throttleCmd = input.hold && l.fuel > 0 ? 1 : 0;
        game.burning = l.thrust() > 0;
        const n = Math.ceil(dt / 0.005);
        for (let i = 0; i < n; i++) {
          l.step(dt / n);
          if (!lifted && l.status !== 'flying') {
            // still resting on the ground: the surface pushes back (no touchdown yet)
            l.status = 'flying';
            l.y[1] = 0;
            l.y[3] = Math.max(0, l.y[3]);
          }
          if (l.altitude > 0.1) lifted = true;
          peak = Math.max(peak, l.altitude);
          if (l.status !== 'flying') break;
        }
        if (l.status === 'landed') {
          if (peak < 0.4) {
            game.status = 'lost';
            game.reason = `Only ${(peak * 100).toFixed(0)} cm high. Hold ENGINE a little longer to reach 40 cm!`;
            return;
          }
          const v = l.touch.vz;
          game.status = 'won';
          game.stars = v <= 0.5 ? 3 : v <= 1 ? 2 : 1;
          game.result = [`Hop height: ${(peak * 100).toFixed(0)} cm (Vikram’s real hop: about 40 cm)`, `Touchdown at ${v.toFixed(2)} m/s`];
        } else if (l.status === 'crashed') {
          game.status = 'lost';
          game.reason = `Landed at ${l.touch.vz.toFixed(1)} m/s: too hard. Tap ENGINE just before touchdown to soften it.`;
        } else if (l.altitude > 6) {
          game.status = 'lost';
          game.reason = 'Too high! This was meant to be a little hop. Use short bursts.';
        }
      },
      hud: () => ({ fuel: l.fuel / (mass - dry), info: [['Height', `${Math.round(Math.max(0, l.altitude) * 100)} cm`], ['Best', `${Math.round(peak * 100)} cm / 40 cm`]] }),
      scene: () => ({ kind: 'lander', surface: 'moon', z0: 4, span: 4 }),
      telemetry: () => [l.t, Math.max(0, l.altitude), Math.abs(l.vz)],
      bot() {
        if (!lifted || (l.vz > 0 && peak < 0.3)) return { hold: peak < 0.3 };
        // coming down: brake late and gently
        const aNet = engine.thrust / l.mass - g;
        const v = -l.vz;
        return { hold: v > 0.3 && (v * v) / (2 * aNet) + 0.05 > l.altitude };
      },
    };
    return game;
  },
};

/* ------------------------------------------------------------------ */
/* 10. Get them home (Apollo 13, April 1970)                            */
/* ------------------------------------------------------------------ */
const L13 = {
  id: 'home13',
  title: 'Get them home',
  mission: 'Apollo 13',
  agency: 'NASA',
  year: 1970,
  date: '1970-04-17',
  button: 'BRAKE',
  control: 'hold',
  goal: 'Steer the crew into the safe re-entry window: between −5.3° and −7.4°.',
  guide: ['Apollo 13 is coming home, but on the wrong path!', 'Too shallow and they skip off the air; too steep and it’s too hot. Hold BRAKE until the angle turns green.'],
  fact: 'After an oxygen tank exploded, the Apollo 13 crew used the Lunar Module’s engine to steer home, and splashed down safely on 17 April 1970.',
  create() {
    const mu = MU.earth, R = 6378e3, rEI = R + 122e3;
    const lo = -7.4, hi = -5.3;
    // a return path from the Moon that would enter far too shallow (about −3°): computed, not scripted
    const ra = 400000e3, r0 = 260000e3;
    const gammaAt = (rp) => {
      const e = (ra - rp) / (ra + rp), p = rp * (1 + e);
      const cosnu = (p / rEI - 1) / e;
      const nu = -Math.acos(Math.max(-1, Math.min(1, cosnu)));
      const vr = Math.sqrt(mu / p) * e * Math.sin(nu), vt = Math.sqrt(mu / p) * (1 + e * Math.cos(nu));
      return (Math.atan2(vr, vt) * 180) / Math.PI;
    };
    let a = rEI - 200e3, b = rEI;
    for (let i = 0; i < 60; i++) {
      const m = (a + b) / 2;
      if (gammaAt(m) < -3.0) a = m;
      else b = m;
    }
    const rp = (a + b) / 2, e = (ra - rp) / (ra + rp), p = rp * (1 + e);
    const nu0 = -Math.acos((p / r0 - 1) / e);
    const s = conicState(mu, rp, e, nu0, Math.PI * 0.75);
    const moonAng = Math.atan2(s.y, s.x) + 0.6;
    const moon = { name: 'moon', mu: MU.moon, R: 1737.4e3, a: 384400e3, phase0: moonAng };
    const world = { central: { name: 'earth', mu, R }, bodies: [moon], ship: { ...s, mass: 44000, dry: 44000 - 1500, thrust: 18016, isp: 305 }, hitRadius: { earth: rEI }, hmax: 1800 };
    const entryAngle = (y) => {
      const r = Math.hypot(y[0], y[1]), v = Math.hypot(y[2], y[3]);
      return (Math.asin((y[0] * y[2] + y[1] * y[3]) / (r * v)) * 180) / Math.PI;
    };
    return orbitalGame({
      world,
      dir: 'retro',
      clock: orbitClock(mu, 7),
      burnClock: 6, // slow during the burn: a few m/s decide the entry angle
      clockR: (g) => Math.max(Math.hypot(g.w.y[0], g.w.y[1]), 20000e3),
      horizon: () => 4 * DAY,
      trailStep: 1e6,
      check(g) {
        const o = g.w.orbitAbout('earth');
        if (o.radialV > 0 && Math.hypot(g.w.y[0], g.w.y[1]) < 100000e3) return g.lose('You missed Earth and swung back out into space! Brake a little more to aim lower.');
        if (g.w.t > 6 * DAY) return g.lose('Time is up.');
      },
      onHit(g, b) {
        if (b !== 'earth') return g.lose('Crashed into the Moon!');
        const ang = entryAngle(g.w.y);
        if (ang < lo) return g.lose(`Entry at ${ang.toFixed(1)}°: too steep! The capsule would get too hot. Brake less next time.`);
        if (ang > hi) return g.lose(`Entry at ${ang.toFixed(1)}°: too shallow, the capsule skips off the air. Brake a little more.`);
        const err = Math.abs(ang + 6.5);
        g.win(err < 0.2 ? 3 : err < 0.6 ? 2 : 1, ['Splashdown! The crew is home safe.', `Entry angle ${ang.toFixed(2)}° (perfect is about −6.5°)`, `Burn used: ${g.w.dvUsed.toFixed(1)} m/s`]);
      },
      info(g) {
        const h2 = g.pred?.hit;
        const ang = h2 && h2.body === 'earth' ? (Math.asin((h2.x * h2.vx + h2.y * h2.vy) / (Math.hypot(h2.x, h2.y) * Math.hypot(h2.vx, h2.vy))) * 180) / Math.PI : null;
        const ok = ang != null && ang >= lo && ang <= hi;
        return [['Entry angle', ang == null ? 'missing Earth!' : `${ang.toFixed(2)}° ${ok ? '(safe)' : ang > hi ? '(too shallow)' : '(too steep)'}`], ['Safe window', '−5.3° to −7.4°']];
      },
      scene: (g) => ({ central: 'earth', bodies: ['moon'], rings: [], minR: { earth: 8, moon: 5 }, focus: [[0, 0], [g.w.y[0], g.w.y[1]], [r0 * 0.9, 0], [-r0 * 0.9, 0], [0, r0 * 0.9], [0, -r0 * 0.9]] }),
      bot(g) {
        const h2 = g.pred?.hit;
        const ang = h2 && h2.body === 'earth' ? (Math.asin((h2.x * h2.vx + h2.y * h2.vy) / (Math.hypot(h2.x, h2.y) * Math.hypot(h2.vx, h2.vy))) * 180) / Math.PI : 0;
        return { hold: !h2 || ang > -6.4 };
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* 11. Escape Earth (Mangalyaan trans-Mars injection, 1 Dec 2013)       */
/* ------------------------------------------------------------------ */
const LESC = {
  id: 'escape',
  title: 'Escape Earth',
  mission: 'Mangalyaan',
  agency: 'ISRO',
  year: 2013,
  date: '2013-12-01',
  button: 'BOOST',
  control: 'hold',
  goal: 'Break free of Earth’s gravity with at least 2.6 km/s to spare for the trip to Mars.',
  guide: ['To reach Mars you must escape Earth completely!', 'Hold BOOST as you swoop past Earth, until the dotted line opens up and flies away.'],
  fact: 'On 1 December 2013 Mangalyaan fired its engine for about 22 minutes near Earth and left for Mars.',
  create() {
    const mu = MU.earth, R = 6378e3;
    const rp = R + 248e3, ra = R + 192874e3;
    const e = (ra - rp) / (ra + rp);
    const s = conicState(mu, rp, e, (-115 * Math.PI) / 180, -Math.PI / 2);
    const reserve = 845, isp = 315;
    const world = { central: { name: 'earth', mu, R }, bodies: [], ship: { ...s, mass: wetFor(reserve, 900, isp), dry: reserve, thrust: 440, isp }, hmax: 900 };
    const need = 2600;
    const vInf = (o) => (o.energy > 0 ? Math.sqrt(2 * o.energy) : 0);
    return orbitalGame({
      world,
      dir: 'pro',
      clock: orbitClock(mu, 9),
      clockR: (g) => Math.hypot(g.w.y[0], g.w.y[1]),
      horizon: () => 2 * DAY,
      trailStep: 4e5,
      check(g) {
        const o = g.w.orbitAbout('earth');
        if (!g.burning && vInf(o) >= need) {
          const dv = g.w.dvUsed;
          return g.win(dv <= 600 ? 3 : dv <= 720 ? 2 : 1, [`Escaped at ${(vInf(o) / 1000).toFixed(2)} km/s to spare`, `Fuel used: ${Math.round(dv)} m/s of Δv`]);
        }
        if (g.w.fuel <= 0 && !g.burning) return g.lose('Out of fuel before escaping. Burn closer to Earth, where you are fastest.');
        if (o.r > 120000e3 && o.radialV > 0 && g.w.dvUsed > 1) return g.lose(o.energy > 0 ? 'You escaped, but too slowly to reach Mars. Burn longer next time.' : 'Not enough speed: Earth pulled you back. Hold BOOST longer near Earth.');
        if (g.w.t > 4 * DAY) return g.lose('Time is up. Hold BOOST as you pass close to Earth.');
      },
      onHit: (g) => g.lose('Crashed into Earth.'),
      info(g) {
        const o = g.w.orbitAbout('earth');
        return [['Spare speed', o.energy > 0 ? `${(vInf(o) / 1000).toFixed(2)} km/s` : 'still trapped'], ['Goal', '≥ 2.6 km/s']];
      },
      scene: (g) => ({ central: 'earth', bodies: [], rings: [], focus: [[0, 0], [g.w.y[0], g.w.y[1]], [rp * 6, 0], [-rp * 6, 0], [0, rp * 6], [0, -rp * 6]] }),
      bot(g) {
        const o = g.w.orbitAbout('earth');
        return { hold: o.r < rp * 1.45 && vInf(o) < need * 1.01 };
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* Apollo 11: The Eagle has landed (20 July 1969)                      */
/* ------------------------------------------------------------------ */
const LA11 = {
  id: 'eagle',
  title: 'The Eagle has landed',
  mission: 'Apollo 11',
  agency: 'NASA',
  year: 1969,
  date: '1969-07-20',
  button: 'ENGINE',
  control: 'hold',
  goal: 'Land the Eagle gently on the Moon: under 3 m/s, before the fuel runs out.',
  guide: ['Neil Armstrong is flying the Eagle down to the Moon!', 'Hold ENGINE to slow down. Fuel is very low, so don’t hover too long.'],
  fact: 'On 20 July 1969 Neil Armstrong steered the Eagle past a field of boulders and landed with less than a minute of fuel to spare.',
  create: () =>
    landerLevel({
      g: 1.62,
      engine: { thrust: 45040, isp: 305, minThrottle: 0.1 },
      mass: 7330,
      dry: 6930,
      z0: 300,
      vz0: -9,
      speed: 1.0,
      holdThrottle: 0.6,
      limits: { vz: 3, vx: 1.2, tilt: 12 },
      stars: (v) => (v <= 0.8 ? 3 : v <= 1.6 ? 2 : 1),
      surface: 'moon',
    }),
};

/* ------------------------------------------------------------------ */
/* Chandrayaan-1: Moon Impact Probe (14 November 2008)                 */
/* ------------------------------------------------------------------ */
const LMIP = {
  id: 'mip',
  title: 'Moon Impact Probe',
  mission: 'Chandrayaan-1',
  agency: 'ISRO',
  year: 2008,
  date: '2008-11-14',
  button: 'DROP',
  control: 'tap',
  goal: 'Drop the probe so it lands near the south pole target.',
  guide: ['The probe falls in a curve, not straight down!', 'The red cross shows where it would land. Tap DROP when it reaches the green target.'],
  fact: 'On 14 November 2008 Chandrayaan-1’s Moon Impact Probe was released from 100 km up and hit near Shackleton crater at the south pole. The spot is called Jawahar Point.',
  create() {
    const mu = MU.moon, R = 1737.4e3, r0 = R + 100e3;
    const v0 = Math.sqrt(mu / r0);
    const kick = 60; // m/s retro push on release (gives a ~25-minute fall, like the real probe)
    const tgtAng = -Math.PI / 2; // south pole, at the bottom of the view
    // how far ahead of the drop point does the probe land? (computed with the same physics)
    const lead = (() => {
      const t = createWorld({ central: { name: 'moon', mu, R }, bodies: [], ship: { x: r0, y: 0, vx: 0, vy: v0 - kick, mass: 1, dry: 1, thrust: 0, isp: 1 }, hmax: 30 });
      t.advance(3 * 3600);
      return Math.atan2(t.y[1], t.y[0]);
    })();
    // start about 6 seconds of play before the ideal drop moment
    const ang0 = tgtAng - lead - ((v0 / r0) * 55 * 6);
    const world = { central: { name: 'moon', mu, R }, bodies: [], ship: { x: r0 * Math.cos(ang0), y: r0 * Math.sin(ang0), vx: -v0 * Math.sin(ang0), vy: v0 * Math.cos(ang0), mass: 35, dry: 35, thrust: 0, isp: 1 }, hmax: 60 };
    let dropped = false;
    const surfDist = (x, y) => {
      let d = Math.atan2(y, x) - tgtAng;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) * R;
    };
    // where would it land if dropped now? (same physics, computed ahead)
    const impactIfDropped = (w) => {
      const v = Math.hypot(w.y[2], w.y[3]);
      const t = createWorld({ central: { name: 'moon', mu, R }, bodies: [], ship: { x: w.y[0], y: w.y[1], vx: w.y[2] * (1 - kick / v), vy: w.y[3] * (1 - kick / v), mass: 1, dry: 1, thrust: 0, isp: 1 }, hmax: 30 });
      t.advance(3 * 3600);
      return t.status === 'hit' ? { x: t.y[0], y: t.y[1] } : null;
    };
    let aim = null, aimAt = -1;
    const g = orbitalGame({
      world,
      noFuel: true,
      dir: 'pro',
      clock: () => (dropped ? 200 : 55),
      clockR: () => 0,
      horizon: () => (dropped ? 3600 : 1),
      trailStep: 2e4,
      beforeStep(gg, input) {
        gg.noEngine = true;
        if (!dropped && gg.realT - aimAt > 0.05) {
          aim = impactIfDropped(gg.w);
          aimAt = gg.realT;
        }
        if (!dropped && input.tap) {
          dropped = true;
          const v = Math.hypot(gg.w.y[2], gg.w.y[3]);
          gg.w.y[2] *= 1 - kick / v;
          gg.w.y[3] *= 1 - kick / v;
          gg.predAt = -1;
        }
      },
      check(gg) {
        if (!dropped && gg.realT > 30) gg.lose('The probe was never dropped! Tap DROP when the red cross is on the green target.');
      },
      onHit(gg) {
        const d = surfDist(gg.w.y[0], gg.w.y[1]);
        if (d > 700e3) return gg.lose(`Impact ${fmtKm(d)} from the south pole. Watch the red cross and drop when it is on the target.`);
        gg.win(d < 50e3 ? 3 : d < 150e3 ? 2 : 1, ['Impact! The probe reached the Moon’s south pole region.', `Distance from target: ${fmtKm(d)}`]);
      },
      info(gg) {
        if (dropped) return [['Height', fmtKm(Math.hypot(gg.w.y[0], gg.w.y[1]) - R)], ['Status', 'Falling…']];
        return [['Lands from target', aim ? fmtKm(surfDist(aim.x, aim.y)) : '—'], ['Goal', 'south pole']];
      },
      scene: (gg) => ({ central: 'moon', bodies: [], rings: [], marks: [{ x: R * Math.cos(tgtAng), y: R * Math.sin(tgtAng), kind: 'target', label: 'Shackleton crater' }, ...(!dropped && aim ? [{ x: aim.x, y: aim.y, kind: 'x' }] : [])], noPred: !dropped, focus: [[R * 1.25, 0], [-R * 1.25, 0], [0, R * 1.25], [0, -R * 1.25]] }),
      bot(gg) {
        return { tap: !dropped && aim && surfDist(aim.x, aim.y) < 25e3 };
      },
    });
    return g;
  },
};

/* ------------------------------------------------------------------ */
/* New Horizons: snap Pluto (14 July 2015)                             */
/* ------------------------------------------------------------------ */
const LPLUTO = {
  id: 'pluto',
  title: 'Photo of Pluto',
  mission: 'New Horizons',
  agency: 'NASA',
  year: 2015,
  date: '2015-07-14',
  button: 'SNAP',
  control: 'tap',
  goal: 'Take Pluto’s photo at the closest moment of the flyby.',
  guide: ['New Horizons races past Pluto at almost 14 km per second!', 'You get one photo. Tap SNAP when you are closest, for the sharpest picture.'],
  fact: 'On 14 July 2015 New Horizons flew 12,500 km above Pluto and took the first close-up pictures, including its famous heart-shaped plain.',
  create() {
    const mu = 869.6e9, R = 1188.3e3;
    const rp = R + 12500e3, vInf = 13780;
    const e = 1 + (rp * vInf * vInf) / mu, p = rp * (1 + e);
    const startR = 260000e3;
    const nu0 = -Math.acos((p / startR - 1) / e);
    const s = conicState(mu, rp, e, nu0, Math.PI / 2);
    const world = { central: { name: 'pluto', mu, R }, bodies: [], ship: { ...s, mass: 400, dry: 400, thrust: 0, isp: 1 }, hmax: 120 };
    let snapped = null, best = Infinity;
    return orbitalGame({
      world,
      noFuel: true,
      dir: 'pro',
      clock: (r) => Math.max(60, r / vInf / 3.2),
      clockR: (g) => Math.hypot(g.w.y[0], g.w.y[1]),
      horizon: () => 6 * 3600,
      trailStep: 2e6,
      beforeStep(gg, input) {
        gg.noEngine = true;
        if (!snapped && input.tap) snapped = Math.hypot(gg.w.y[0], gg.w.y[1]);
      },
      check(gg) {
        const d = Math.hypot(gg.w.y[0], gg.w.y[1]);
        best = Math.min(best, d);
        if (snapped) {
          const q = snapped / rp;
          if (q > 1.6) return gg.lose(`Too far away (${fmtKm(snapped - R)} from Pluto): the photo is just a dot. Wait until you are closest!`);
          return gg.win(q < 1.03 ? 3 : q < 1.12 ? 2 : 1, ['Photo taken!', `Distance: ${fmtKm(snapped - R)} (closest possible: 12,500 km)`]);
        }
        if (d > best * 2 && d > rp * 3) gg.lose('You flew past without taking the photo! Tap SNAP as you pass closest.');
      },
      onHit: (gg) => gg.lose('Crashed into Pluto!'),
      info(gg) {
        const d = Math.hypot(gg.w.y[0], gg.w.y[1]);
        return [['Distance', fmtKm(d - R)], ['Speed', `${(Math.hypot(gg.w.y[2], gg.w.y[3]) / 1000).toFixed(2)} km/s`]];
      },
      scene: (gg) => ({ central: 'pluto', bodies: [], rings: [], focus: [[0, 0], [gg.w.y[0], gg.w.y[1]], [rp * 1.8, 0], [-rp * 1.8, 0]], minR: { pluto: 20 } }),
      bot(gg) {
        const o = gg.w.orbitAbout('pluto');
        return { tap: !snapped && o.radialV >= 0 };
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* Juno: Jupiter orbit insertion (4 July 2016)                          */
/* ------------------------------------------------------------------ */
const LJUNO = {
  id: 'juno',
  title: 'Juno at Jupiter',
  mission: 'Juno',
  agency: 'NASA',
  year: 2016,
  date: '2016-07-04',
  button: 'BRAKE',
  control: 'hold',
  goal: 'Brake as you swoop past Jupiter to be caught in orbit. Use as little fuel as you can.',
  guide: ['Jupiter’s gravity is huge: you are falling at almost 58 km/s!', 'Hold BRAKE near the closest point and stop once you are caught.'],
  fact: 'On 4 July 2016 Juno fired its main engine for 35 minutes and became the second spacecraft ever to orbit Jupiter.',
  create: () =>
    captureLevel({
      body: 'jupiter',
      mu: MU.jupiter,
      R: 71492e3,
      vInf: 5500,
      periAlt: 4200e3,
      startR: 2.2e9,
      dry: 1600,
      wetDv: 1500,
      thrust: 645,
      isp: 318,
      apoMax: 8.3e9,
      periMin: 1000e3,
      starsBy: (g) => (g.w.dvUsed <= 645 ? 3 : g.w.dvUsed <= 760 ? 2 : 1),
      botApo: 0.85,
      info2: (o) => ['Far point', o.energy < 0 ? fmtKm(o.apo - 71492e3) : 'not caught yet'],
    }),
};

/* ------------------------------------------------------------------ */
/* Apollo 8: Earthrise (24 December 1968)                              */
/* ------------------------------------------------------------------ */
const LEARTH = {
  id: 'earthrise',
  title: 'Earthrise',
  mission: 'Apollo 8',
  agency: 'NASA',
  year: 1968,
  date: '1968-12-24',
  button: 'SNAP',
  control: 'tap',
  goal: 'Photograph the Earth just as it rises over the Moon’s horizon.',
  guide: ['You are orbiting the Moon. Earth is hidden behind it!', 'Watch the window view. Tap SNAP just after Earth peeks over the horizon.'],
  fact: 'On 24 December 1968 astronaut Bill Anders took “Earthrise”, one of the most famous photos ever, from lunar orbit.',
  create() {
    const mu = MU.moon, R = 1737.4e3, r0 = R + 110e3;
    const v0 = Math.sqrt(mu / r0);
    const eDir = Math.PI / 2; // Earth far away, straight "up" in the view
    const dip = Math.acos(R / r0); // the horizon is below the local horizontal by this angle
    // elevation of Earth above the visible horizon, seen from the spacecraft (degrees)
    const elev = (x, y) => {
      const a = Math.atan2(y, x);
      let d = eDir - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return ((Math.PI / 2 + dip - Math.abs(d)) * 180) / Math.PI;
    };
    const w0 = v0 / r0;
    const angRise = eDir - (Math.PI / 2 + dip); // moving counter-clockwise, Earth rises here
    const ang0 = angRise - w0 * 45 * 7; // ~7 s of play before Earthrise
    const world = { central: { name: 'moon', mu, R }, bodies: [], ship: { x: r0 * Math.cos(ang0), y: r0 * Math.sin(ang0), vx: -v0 * Math.sin(ang0), vy: v0 * Math.cos(ang0), mass: 28000, dry: 28000, thrust: 0, isp: 1 }, hmax: 60 };
    let snapped = null, peaked = -90;
    return orbitalGame({
      world,
      noFuel: true,
      dir: 'pro',
      clock: () => 45,
      clockR: () => 0,
      horizon: () => 1800,
      trailStep: 2e4,
      beforeStep(gg, input) {
        gg.noEngine = true;
        if (snapped == null && input.tap) snapped = elev(gg.w.y[0], gg.w.y[1]);
      },
      check(gg) {
        const e = elev(gg.w.y[0], gg.w.y[1]);
        peaked = Math.max(peaked, e);
        if (snapped != null) {
          if (snapped < 0) return gg.lose('Too early: Earth was still hidden behind the Moon. Wait for it to peek over the horizon!');
          if (snapped > 12) return gg.lose(`Too late: Earth was already ${snapped.toFixed(0)}° up. Snap it right as it rises!`);
          return gg.win(snapped < 1.5 ? 3 : snapped < 4 ? 2 : 1, ['Earthrise!', `Earth was ${snapped.toFixed(1)}° above the Moon’s horizon`]);
        }
        if (e > 14) gg.lose('You missed the moment! Tap SNAP as soon as Earth peeks over the horizon.');
      },
      onHit: (gg) => gg.lose('Crashed into the Moon!'),
      info(gg) {
        const e = elev(gg.w.y[0], gg.w.y[1]);
        return [['Earth above horizon', e < 0 ? 'not yet' : `${e.toFixed(1)}°`], ['Best photo', '0°–3°']];
      },
      scene: (gg) => ({ central: 'moon', bodies: [], rings: [], noPred: true, keepWide: true, windowView: { elev: elev(gg.w.y[0], gg.w.y[1]) }, earthArrow: eDir, focus: [[R * 1.35, 0], [-R * 1.35, 0], [0, R * 1.35], [0, -R * 1.35]] }),
      bot(gg) {
        return { tap: snapped == null && elev(gg.w.y[0], gg.w.y[1]) > 0.8 };
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* SLV-3: Rohini to orbit (18 July 1980)                               */
/* ------------------------------------------------------------------ */
const LSLV = {
  id: 'rohini',
  title: 'Rohini to orbit',
  mission: 'SLV-3',
  agency: 'ISRO',
  year: 1980,
  date: '1980-07-18',
  button: 'BOOST',
  control: 'hold',
  goal: 'Speed up sideways until you stop falling back: a real orbit, above the air.',
  guide: ['Orbit means falling around Earth so fast that you keep missing it!', 'Hold BOOST until the dotted line goes all the way round Earth without touching the air.'],
  fact: 'On 18 July 1980 India’s own SLV-3 rocket put the Rohini satellite into orbit. India became the sixth country able to launch its own satellites.',
  create() {
    const mu = MU.earth, R = 6378e3, rAir = R + 100e3, r0 = R + 300e3;
    const world = { central: { name: 'earth', mu, R }, bodies: [], ship: { x: 0, y: r0, vx: -6500, vy: 120, mass: 480, dry: 270, thrust: 4200, isp: 280 }, hitRadius: { earth: rAir }, hmax: 30 };
    return orbitalGame({
      world,
      dir: 'pro',
      clock: () => 40,
      burnClock: 40,
      clockR: () => 0,
      horizon: () => 6000,
      trailStep: 3e4,
      check(g) {
        const o = g.w.orbitAbout('earth');
        if (!g.burning && o.energy < 0 && o.peri > R + 150e3) {
          const ecc = (o.apo - o.peri) / 1000;
          return g.win(ecc < 700 ? 3 : ecc < 2000 ? 2 : 1, ['In orbit! You are falling around Earth.', `Orbit: ${fmtKm(o.peri - R)} × ${fmtKm(o.apo - R)}`]);
        }
        if (!g.burning && o.energy >= 0) return g.lose('Too fast: you escaped from Earth! An orbit needs about 7.8 km/s, not more than 11.');
        if (g.w.fuel <= 0 && !g.burning) return g.lose('Out of fuel before reaching orbit.');
      },
      onHit: (g) => g.lose('You fell back into the atmosphere. Hold BOOST longer to go faster sideways!'),
      info(g) {
        const o = g.w.orbitAbout('earth');
        return [['Speed', `${(o.v / 1000).toFixed(2)} km/s`], ['Lowest point', o.peri < rAir ? 'inside the air' : fmtKm(o.peri - R)]];
      },
      scene: (g) => ({ central: 'earth', bodies: [], rings: [{ body: 'earth', r: rAir, label: '', thin: true }], focus: [[R * 1.25, 0], [-R * 1.25, 0], [0, R * 1.25], [0, -R * 1.25]] }),
      bot(g) {
        const o = g.w.orbitAbout('earth');
        return { hold: o.peri < R + 260e3 };
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* Cassini: Saturn orbit insertion (1 July 2004)                        */
/* ------------------------------------------------------------------ */
const LCAS = {
  id: 'cassini',
  title: 'Cassini at Saturn',
  mission: 'Cassini–Huygens',
  agency: 'NASA / ESA',
  year: 2004,
  date: '2004-07-01',
  button: 'BRAKE',
  control: 'hold',
  goal: 'Brake as you skim past Saturn’s rings to be caught in orbit.',
  guide: ['Cassini flew through a gap in Saturn’s rings!', 'Hold BRAKE near the closest point, and stop as soon as you are caught.'],
  fact: 'On 1 July 2004 Cassini fired its engine for 96 minutes and became the first spacecraft to orbit Saturn. It studied Saturn for 13 years.',
  create: () =>
    captureLevel({
      body: 'saturn',
      mu: MU.saturn,
      R: 60268e3,
      vInf: 5200,
      periAlt: 19880e3,
      startR: 1.2e9,
      dry: 3500,
      wetDv: 1300,
      thrust: 445,
      isp: 308,
      apoMax: 9.5e9,
      periMin: 5000e3,
      starsBy: (g) => (g.w.dvUsed <= 660 ? 3 : g.w.dvUsed <= 760 ? 2 : 1),
      botApo: 0.85,
      info2: (o) => ['Far point', o.energy < 0 ? fmtKm(o.apo - 60268e3) : 'not caught yet'],
    }),
};

/* ------------------------------------------------------------------ */
/* PSLV-C37: 104 satellites (15 February 2017)                          */
/* ------------------------------------------------------------------ */
const L104 = {
  id: 'sats104',
  title: '104 satellites',
  mission: 'PSLV-C37',
  agency: 'ISRO',
  year: 2017,
  date: '2017-02-15',
  button: 'RELEASE',
  control: 'tap',
  goal: 'Release all 104 satellites in 13 groups, leaving a safe gap so none bump into each other.',
  guide: ['Each group gets a gentle push from a spring and drifts away.', 'Wait until the gap bar is green, then tap RELEASE. Too soon and they bump!'],
  fact: 'On 15 February 2017 ISRO’s PSLV-C37 launched 104 satellites in one flight, a world record at the time.',
  create() {
    // relative motion over a few minutes is a straight line at the spring speed (orbital effects are tiny)
    const push = 0.55, safe = 4.0, groups = 13, simRate = 6;
    const sats = [];
    let t = 0;
    const game = {
      kind: 'deploy',
      status: 'play',
      stars: 0,
      reason: '',
      result: [],
      burning: false,
      sats,
      get t() {
        return t;
      },
      gap() {
        const last = sats[sats.length - 1];
        return last ? (t - last.t0) * push : Infinity;
      },
      update(dt, input) {
        if (game.status !== 'play') return;
        t += dt * simRate;
        if (input.tap) {
          if (game.gap() < safe) {
            game.status = 'lost';
            game.reason = `Too close! The new group was only ${game.gap().toFixed(1)} m from the last one. Wait for the green bar.`;
            return;
          }
          const k = sats.length;
          sats.push({ t0: t, dir: (k * 2.39996) % (2 * Math.PI) });
        }
        if (sats.length >= groups) {
          const total = t / 60;
          game.status = 'won';
          game.stars = total < 1.8 ? 3 : total < 2.5 ? 2 : 1;
          game.result = ['All 104 satellites released safely!', `Time taken: ${total.toFixed(1)} minutes (the real release took about 11 minutes)`];
          return;
        }
        if (t > 8 * 60) {
          game.status = 'lost';
          game.reason = 'Too slow: the rocket stage drifted out of the planned orbit window. Release a little faster.';
        }
      },
      hud: () => ({ fuel: null, info: [['Released', `${Math.min(104, sats.length * 8)} / 104`], ['Gap', game.gap() === Infinity ? 'clear' : `${game.gap().toFixed(1)} m ${game.gap() >= safe ? '(safe)' : '(wait)'}`]] }),
      scene: () => ({ kind: 'deploy', safe, push, groups }),
      telemetry: () => [t, Math.min(12, game.gap() === Infinity ? 12 : game.gap()), sats.length * 8],
      bot: () => ({ tap: game.gap() >= safe + 0.3 }),
    };
    return game;
  },
};

/* ------------------------------------------------------------------ */
/* SpaDeX: India's first docking (16 January 2025)                     */
/* ------------------------------------------------------------------ */
const LDOCK = {
  id: 'spadex',
  title: 'SpaDeX docking',
  mission: 'SpaDeX',
  agency: 'ISRO',
  year: 2025,
  date: '2025-01-16',
  button: 'BRAKE',
  control: 'hold',
  goal: 'Dock gently with the other satellite: touch at under 5 cm per second.',
  guide: ['In space nothing slows you down. You will keep drifting forever!', 'Hold BRAKE to slow down, but don’t stop before you touch.'],
  fact: 'On 16 January 2025 ISRO’s two SpaDeX satellites docked in orbit, making India the fourth country to dock spacecraft in space.',
  create() {
    const brake = 0.004, rate = 3; // m/s² from the small thrusters; time runs 3× faster
    let x = 18, v = -0.24, t = 0, stopped = false, fuel = 1;
    const game = {
      kind: 'dock',
      status: 'play',
      stars: 0,
      reason: '',
      result: [],
      burning: false,
      get x() {
        return x;
      },
      get v() {
        return v;
      },
      update(dt, input) {
        if (game.status !== 'play') return;
        const n = Math.ceil((dt * rate) / 0.01), h = (dt * rate) / n;
        game.burning = !!input.hold && v < 0 && fuel > 0;
        for (let i = 0; i < n; i++) {
          // Newton's first law: velocity only changes while the thrusters fire
          if (game.burning) {
            v = Math.min(0, v + brake * h);
            fuel = Math.max(0, fuel - h / 200);
          }
          x += v * h;
          t += h;
          if (x <= 0) {
            const sp = -v;
            if (sp > 0.05) {
              game.status = 'lost';
              game.reason = `Bump! You touched at ${(sp * 100).toFixed(1)} cm/s. Docking needs under 5 cm/s. Brake earlier.`;
            } else {
              game.status = 'won';
              game.stars = sp <= 0.015 ? 3 : sp <= 0.03 ? 2 : 1;
              game.result = ['Docked! India is the fourth country to dock in space.', `Contact speed: ${(sp * 100).toFixed(1)} cm/s`];
            }
            return;
          }
          if (v >= 0 && !stopped) stopped = true;
        }
        if (stopped) {
          game.status = 'lost';
          game.reason = `You stopped ${x.toFixed(1)} m short. Nothing pushes you again in space! Brake a little less.`;
        }
      },
      hud: () => ({ fuel, info: [['Distance', `${Math.max(0, x).toFixed(2)} m`], ['Speed', `${(Math.abs(v) * 100).toFixed(1)} cm/s`]], alert: x < 3 && -v > 0.05 ? 'Too fast!' : null }),
      scene: () => ({ kind: 'dock' }),
      /** where you would stop if you braked from now on */
      stopX: () => x - (v * v) / (2 * brake),
      telemetry: () => [t, Math.max(0, x), Math.abs(v)],
      bot() {
        const stop = (v * v) / (2 * brake);
        return { hold: -v > 0.012 && stop + 0.15 > x };
      },
    };
    return game;
  },
};

export const CHAPTERS = [
  { id: 'moon', title: 'Earth & Moon', levels: ['earthrise', 'eagle', 'home13', 'rohini', 'mip', 'sats104', 'raise', 'moonshot', 'catchmoon', 'vikram', 'hop', 'spadex', 'sre1', 'dodge', 'navic', 'lvm3', 'hazard', 'pragyan', 'insat', 'pushpak'] },
  { id: 'mars', title: 'Planets & beyond', levels: ['slingshot', 'cassini', 'window', 'escape', 'marscapture', 'pluto', 'juno', 'terror', 'astrosat', 'aditya'] },
];
/** Levels in timeline order: real mission dates, 1969 → 2023. */
export const LEVELS = [LEARTH, LA11, L13, L8, LSLV, LCAS, LMIP, L5, LESC, L6, LPLUTO, LJUNO, L104, L7, L1, L2, L3, NEW_LEVELS.find((l) => l.id === 'hazard'), L4, LHOP, LDOCK, ...NEW_LEVELS.filter((l) => l.id !== 'hazard')].sort((a, b) => a.date.localeCompare(b.date));
export const levelById = (id) => LEVELS.find((l) => l.id === id);
