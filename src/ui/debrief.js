/**
 * Post-flight debrief: a small graph of the flight, the star targets, what the
 * real mission did, and Vyom's physics explanation of what went wrong.
 * Everything here only READS the flight; it never changes the physics.
 */
import { h, fitCanvas } from './dom.js';
import briefs from '../../content/briefs.json';

export const briefFor = (id) => briefs[id] || null;

/** Records [t, a, b] samples during a flight, keeping at most `max` evenly spread points. */
export function flightRecorder(max = 360) {
  let pts = [];
  let stride = 1, n = 0;
  return {
    add(s) {
      if (!s || !s.every(Number.isFinite)) return;
      if (n++ % stride === 0) pts.push(s);
      if (pts.length > max) {
        pts = pts.filter((_, i) => i % 2 === 0);
        stride *= 2;
      }
    },
    last(s) {
      if (s && s.every(Number.isFinite)) pts.push(s);
    },
    get points() {
      return pts;
    },
  };
}

const fmtLen = (m) => (m >= 1e9 ? `${(m / 1.496e11).toFixed(2)} AU` : m >= 1e4 ? `${Math.round(m / 1000).toLocaleString('en-US')} km` : m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`);
const fmtSpd = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} km/s` : v >= 10 ? `${Math.round(v)} m/s` : `${v.toFixed(1)} m/s`);
const fmtTime = (s) => (s >= 2 * 86400 ? `${(s / 86400).toFixed(0)} days` : s >= 7200 ? `${(s / 3600).toFixed(1)} h` : s >= 120 ? `${(s / 60).toFixed(0)} min` : `${s.toFixed(0)} s`);

/** How to label the two measured values for each level. */
function units(id) {
  if (id === 'spadex') return [fmtLen, (v) => `${(v * 100).toFixed(1)} cm/s`];
  if (id === 'sats104') return [fmtLen, (v) => `${Math.round(v)} satellites`];
  if (id === 'window' || id === 'slingshot') return [(m) => `${(m / 1.496e11).toFixed(2)} AU`, fmtSpd];
  if (id === 'astrosat') return [(d) => `${d.toFixed(1)}°`, (d) => `${d.toFixed(2)}°/s`];
  if (id === 'insat') return [(d) => `${d.toFixed(1)}°`, (d) => `${d.toFixed(2)}° per day`];
  if (id === 'pragyan') return [fmtLen, fmtLen];
  return [fmtLen, fmtSpd];
}

/** A canvas graph of the two flight values over time. Draws itself once it is on the page. */
export function flightGraph(id, points) {
  if (!points || points.length < 3) return null;
  const b = briefFor(id);
  const [la, lb] = b?.measure || ['Height', 'Speed'];
  const [fa, fb] = units(id);
  const t0 = points[0][0], t1 = points[points.length - 1][0];
  const maxA = Math.max(...points.map((p) => p[1])) || 1;
  const maxB = Math.max(...points.map((p) => p[2])) || 1;
  const canvas = h('canvas.debrief-graph', { role: 'img', 'aria-label': `Graph of ${la.toLowerCase()} and ${lb.toLowerCase()} during the flight` });
  const wrap = h(
    'div.debrief-graph-wrap',
    h('div.graph-legend', h('span.lg-a', `${la}: ${fa(Math.min(...points.map((p) => p[1])))} to ${fa(maxA)}`), h('span.lg-b', `${lb}: ${fb(Math.min(...points.map((p) => p[2])))} to ${fb(maxB)}`)),
    canvas,
    h('div.graph-axis.small.muted', h('span', 'Start'), h('span', `Flight time: ${fmtTime(Math.max(0, t1 - t0))}`)),
  );
  const paint = () => {
    if (!canvas.isConnected) return;
    const { w, h: H, ctx } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, H);
    ctx.strokeStyle = 'rgba(141,156,181,0.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (H * i) / 4);
      ctx.lineTo(w, (H * i) / 4);
      ctx.stroke();
    }
    const span = t1 - t0 || 1;
    const line = (k, max, col) => {
      // stretch each line between its own lowest and highest value, so small changes show
      const min = Math.min(...points.map((p) => p[k]));
      const lo = max - min < max * 0.02 ? 0 : min - (max - min) * 0.08;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = ((p[0] - t0) / span) * (w - 4) + 2;
        const y = H - 4 - ((p[k] - lo) / (max - lo || 1)) * (H - 10);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    };
    line(1, maxA, '#ff9933');
    line(2, maxB, '#4cc9f0');
  };
  requestAnimationFrame(() => requestAnimationFrame(paint));
  return wrap;
}

/** The three star targets, with the ones earned marked. */
export function starTargets(id, earned) {
  const b = briefFor(id);
  if (!b) return null;
  return h(
    'ol.star-targets',
    b.stars.map((t, i) => h('li' + (i < earned ? '.got' : ''), h('span.st', { 'aria-hidden': 'true' }, '★'.repeat(i + 1) + '☆'.repeat(2 - i)), h('span', t), h('span.sr-only', i < earned ? ' (earned)' : ' (not yet)'))),
  );
}

/* ---------- Vyom's physics explanations for a failed flight ---------- */
const MOON_G = 'The Moon adds 1.6 m/s to your falling speed every second.';
const TIPS = [
  [['eagle', 'vikram'], /too fast|touched down/i, `${MOON_G} Your engine needs height to take that speed away again, so start braking higher up and keep braking all the way down.`],
  [['eagle', 'vikram', 'terror'], /flew back up/i, 'Your engine pushes harder than gravity pulls, so holding it too long sends you back up. Brake in shorter bursts once you are slow.'],
  [['terror'], /touched down|too fast/i, 'Mars adds 3.7 m/s to your falling speed every second, more than twice the Moon. Keep the engine on longer near the ground.'],
  [['terror'], /too early/i, 'Above about Mach 2.2 the air hits the parachute so hard that it tears. Wait for the green light, when the capsule has slowed down.'],
  [['terror'], /too late|missed the parachute/i, 'Below Mach 1.1 there is too little height left: Mars’s thin air cannot slow you in time. Open the parachute as soon as the light turns green.'],
  [['hop'], /only|cm high/i, 'To rise, the engine must push harder than the Moon’s gravity pulls. Hold it a little longer so you keep rising to 40 cm.'],
  [['hop'], /too high/i, 'Once you are moving upwards you keep going until gravity stops you. Let go of the engine earlier.'],
  [['hop'], /too hard/i, `${MOON_G} Even a 40 cm fall builds speed, so a short push just before touchdown softens it.`],
  [['catchmoon', 'marscapture', 'juno', 'cassini'], /flew past|not caught/i, 'You were moving faster than escape speed. Brake at the closest point, where you are fastest: there the same fuel takes away the most energy (the Oberth effect).'],
  [['catchmoon', 'marscapture', 'juno', 'cassini'], /too low|dips/i, 'Braking at the closest point shrinks the far side of the orbit. Braking too much pulls the whole orbit down into the planet.'],
  [['catchmoon', 'marscapture', 'juno', 'cassini'], /stretched/i, 'You were caught, but only just. A little more braking at the closest point pulls the far point in.'],
  [['catchmoon', 'marscapture', 'juno', 'cassini'], /crash/i, 'Your path was already close to the surface. Brake for less time, and watch the dotted line before you commit.'],
  [['raise', 'escape'], /fuel|pulled you back|never fired|time is up/i, 'You move fastest at the closest point to Earth, so a burn there adds the most energy and lifts the far side of the orbit the most. Burn there, every time you pass.'],
  [['escape'], /too slowly/i, 'Escaping Earth is not enough: you need extra speed left over to coast all the way to Mars. Keep burning a little longer.'],
  [['moonshot'], /missed|falling back/i, 'The Moon moves about 1 km/s along its orbit. You have to aim for where the Moon will be when you arrive, so watch the dotted line meet the green zone.'],
  [['moonshot'], /deep space|too much/i, 'Near Earth you only need about 10.9 km/s to reach the Moon, but 11.2 km/s escapes Earth entirely. Stop burning as soon as the dotted line reaches the zone.'],
  [['moonshot'], /crash/i, 'Aim for the zone around the Moon, not the Moon itself. Stop burning a little earlier.'],
  [['home13'], /steep/i, 'A steep entry means you hit thick air fast, and the heat and g-forces build too quickly. A smaller burn gives a shallower path.'],
  [['home13'], /shallow|missed earth/i, 'A shallow entry skims the top of the air and bounces back to space, like a stone skipping on water. A slightly bigger burn steepens the path.'],
  [['window'], /./, 'The trip to Mars takes about 9 to 10 months. Mars must be about 44° ahead at launch so that it reaches the meeting point at the same time as you.'],
  [['slingshot'], /./, 'Passing behind Jupiter, its gravity drags you along with its motion and you speed up. A tiny change of aim moves where you pass, which changes your path by a lot.'],
  [['earthrise'], /./, 'Apollo 8 went round the Moon every 2 hours, so Earth rose quickly. The best photo is right as it clears the horizon.'],
  [['pluto'], /./, 'You are fastest and closest at the same moment of a flyby. Before and after, the distance grows quickly.'],
  [['mip'], /./, 'The dropped probe keeps the spacecraft’s 1.6 km/s sideways speed, so it falls in a long curve, not straight down. Drop it before you are over the target.'],
  [['rohini'], /escaped/i, 'About 7.8 km/s sideways keeps you in orbit. At 11.2 km/s you escape Earth for good. Let go of BOOST sooner.'],
  [['rohini'], /fell|atmosphere|fuel/i, 'An orbit is falling sideways so fast that the ground curves away beneath you. Below about 7.8 km/s the curve wins and you fall back.'],
  [['sats104'], /close/i, 'Each group drifts away at about 0.55 m/s, so the gap grows by about half a metre every second. Wait for the safe gap of 4 m.'],
  [['sats104'], /slow/i, 'The gap only needs to reach 4 m. Release as soon as the bar turns green, then the next group.'],
  [['spadex'], /bump/i, 'In space nothing slows you down except your own thrusters (Newton’s first law). Start braking from further away, gently.'],
  [['sre1'], /orbit/i, 'Braking lowers the far side of your orbit. You only fall into the air once your low point is below about 100 km, so keep braking until the red cross appears.'],
  [['sre1'], /./, 'The more you brake, the steeper you fall and the sooner you splash down. Let go of BRAKE the moment the red cross sits on the target.'],
  [['astrosat'], /past|spun/i, 'In space nothing stops a turn (Newton’s first law, for spinning). To stop on the target you must push the other way, starting about halfway there.'],
  [['astrosat'], /./, 'Turning faster gets you there sooner, but needs a longer stop. Push hard, then push back hard halfway.'],
  [['dodge'], /close/i, 'A push lifts the far side of your orbit the most: half an orbit after the burn. Burn when the meeting point is opposite you.'],
  [['dodge'], /wasted|away/i, 'A few centimetres per second is enough to move your orbit by a kilometre. Small burns save fuel for science.'],
  [['navic'], /./, 'Each circle shows every place that distance from one satellite. Only one spot is on all three circles: that is where you are.'],
  [['lvm3'], /fell|falling/i, 'To orbit you need about 7.8 km/s sideways. Lean over gradually: too early and you fall back before you are high enough, too late and you waste fuel going straight up.'],
  [['lvm3'], /dry|ran/i, 'Every empty stage you carry is dead weight. Drop each stage as soon as it is empty, and lean over smoothly to fly sideways.'],
  [['hazard'], /sliding/i, 'Once you move sideways you keep moving (Newton’s first law). Start pushing the other way early, so you arrive just as you stop.'],
  [['hazard'], /./, 'The safe spot is far to one side. Start moving straight away: the side thrusters are gentle and you only have about 90 seconds.'],
  [['pragyan'], /crater|rock/i, 'Pragyan turns slowly. Start turning well before the obstacle and give it a wide berth.'],
  [['pragyan'], /./, 'Every metre costs power and time before the lunar night. Go around the big crater on the side with the most room, then head straight for the spot.'],
  [['aditya'], /drift/i, 'L1 is like a ball balanced on a hilltop: a tiny drift doubles every few weeks. Small, early nudges back towards the dotted loop save a lot of fuel.'],
  [['insat'], /east/i, 'A higher orbit is slower. Speeding up raises your orbit, so you fall behind Earth’s spin and drift west. Use SPEED UP to stop an eastward drift.'],
  [['insat'], /west|month/i, 'A lower orbit goes round faster than Earth spins, so you drift east. Use SLOW DOWN to stop a westward drift, and stop exactly over 82°E.'],
  [['pushpak'], /stall/i, 'Lift needs speed. If you pull up too high, you slow down until the wings can’t hold you. Keep the nose down until about 50 m.'],
  [['pushpak'], /hard/i, 'Without an engine, your speed is your only way to soften the landing. Pull up a little earlier and hold it until you touch.'],
  [['pushpak'], /climb/i, 'Pulling up turns speed into height, but a glider can’t keep climbing. Use short pulls near the ground.'],
  [['spadex'], /short/i, 'Once you stop, nothing pushes you forward again. Let go of BRAKE while you are still creeping towards the target.'],
];

/** Vyom's physics explanation for why this flight failed. */
export function coachTip(id, reason = '') {
  const hit = TIPS.find(([ids, re]) => ids.includes(id) && re.test(reason));
  return hit ? hit[2] : null;
}
