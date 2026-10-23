// Proves every orbital mission can be completed with Mission Assist and the real fuel load.
import { readFileSync } from 'node:fs';
import { buildMission } from '../src/missions/orbital.js';
import { autoplay } from '../src/missions/autoplay.js';
const missions = JSON.parse(readFileSync(new URL('../content/missions.json', import.meta.url)));
const design = JSON.parse(readFileSync(new URL('../content/mission_design.json', import.meta.url)));
const only = process.argv[2];
let allOk = true;
for (const m of missions.filter((x) => x.kind === 'orbital' && (!only || x.id === only))) {
  const t0 = performance.now();
  const mission = buildMission(m, design, {});
  const r = autoplay(mission, { log: (s) => console.log('   ', s) });
  const s = r.sim;
  console.log(`${r.ok ? 'SOLVED  ' : 'FAILED  '} ${m.id.padEnd(13)} stars ${r.stars} · stages ${[...r.done].join(',')} · Δv used ${s.deliveredDv.toFixed(1)} m/s · fuel left ${s.fuel.toFixed(1)} kg · ${s.date().toISOString().slice(0, 10)} · status ${s.status}${s.entry ? ' entry γ ' + s.entry.gamma.toFixed(2) + '°' : ''} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  allOk &&= r.ok;
}
if (!allOk) process.exitCode = 1;
