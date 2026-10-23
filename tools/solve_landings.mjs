// Proves the landing missions can be flown: guidance lands each one safely with the real engines and fuel.
import { readFileSync } from 'node:fs';
import { buildLander, autoland, nearestSafe, isSafe, buildEntry, entryGuidance, rangeTrigger } from '../src/missions/landing.js';
const missions = JSON.parse(readFileSync(new URL('../content/missions.json', import.meta.url)));
const get = (id) => missions.find((m) => m.id === id);
let ok = true;
const report = (name, l, extra = '') => {
  const good = l.status === 'landed';
  ok &&= good;
  console.log(`${good ? 'SOLVED  ' : 'FAILED  '} ${name.padEnd(13)} ${l.status}${l.reason ? ' (' + l.reason + ')' : ''} at x=${l.x.toFixed(1)} m · touchdown v ${l.touch?.vz.toFixed(2)} m/s down, ${l.touch?.vx.toFixed(2)} sideways · fuel left ${l.fuel.toFixed(0)} kg · ${l.t.toFixed(0)} s ${extra}`);
};
{
  const m = get('apollo11');
  const l = buildLander(m);
  const tx = nearestSafe(m.physics.terrain, (m.physics.target.x0 + m.physics.target.x1) / 2, m.physics.footprint);
  autoland(l, tx, { vxMax: 18, kz: 0.1 });
  report('apollo11', l, `· hover-seconds left ${(l.hoverSecondsLeft()).toFixed(0)}`);
}
{
  const m = get('vikram');
  const l = buildLander(m);
  const tx = nearestSafe(m.physics.terrain, 0, m.physics.footprint);
  autoland(l, tx, { vxMax: 6, kz: 0.08, maxTilt: 20 });
  report('vikram', l, `· chose safe spot x=${tx}`);
}
{
  const m = get('perseverance');
  const P = m.physics;
  const e = buildEntry(m);
  let k = 0;
  while (e.phase === 'entry' || e.phase === 'chute') {
    if (e.phase === 'entry' && k++ % 40 === 0) e.liftUp = entryGuidance(e, P.targetDownrange);
    e.step(0.05);
    if (e.phase === 'entry' && k % 10 === 0 && rangeTrigger(e, P.targetDownrange)) e.deployChute();
  }
  const h = e.phase === 'handover' ? e.handoverState() : null;
  const miss = h ? (h.downrange - P.targetDownrange) / 1e3 : NaN;
  console.log(`         perseverance EDL: ${e.phase} · chute at t=${e.chuteAt?.toFixed(0)} s · handover miss ${miss.toFixed(2)} km (ellipse ±${(P.ellipseKm / 2).toFixed(2)}) · peak ${e.peak.g.toFixed(1)} g`);
  ok &&= e.phase === 'handover' && Math.abs(miss) <= P.ellipseKm / 2;
  const L = P.lander;
  const x0 = L.targetCenter + miss * 1000;
  const l = buildLander(m, { lander: L, start: { x: x0, z: h.alt, vx: h.vx, vz: h.vz } });
  const tx = nearestSafe(L.terrain, L.targetCenter, L.footprint);
  autoland(l, tx, { vxMax: 25, kz: 0.12, vzMax: 60, maxTilt: 35, vzMin: L.skycraneSpeed });
  report('perseverance', l, `· safe spot x=${tx}`);
}
if (!ok) process.exitCode = 1;
