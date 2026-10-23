// Colony balance report: reference layouts per world, with/without the wrong-hypothesis penalty.
import { loadContent } from './load_content.mjs';
import { ColonySim } from '../src/core/colony.js';
const c = loadContent();
export const LAYOUTS = {
  cinder: { good: 'solar solar solar solar battery water greenhouse o2gen habitat habitat', lean: 'solar solar solar battery water o2gen greenhouse habitat habitat' },
  veil: { good: 'solar solar solar solar solar solar battery battery water greenhouse o2gen habitat habitat', lean: 'solar solar solar solar solar battery water greenhouse o2gen habitat habitat' },
  hollow: { good: 'solar solar solar shield shield battery water greenhouse o2gen habitat habitat', lean: 'solar solar solar shield battery water greenhouse o2gen habitat habitat' },
};
export function run(world, layout, penalty) {
  const w = c.colony.worlds.find((x) => x.id === world);
  const sim = new ColonySim(c.colony, w, { penalty });
  const placed = layout.split(' ').every((m, i) => sim.place(i, m).ok);
  sim.start();
  let minLife = 999;
  for (let i = 0; i < 2000 && sim.status === 'running'; i++) { sim.step(); minLife = Math.min(minLife, sim.res.oxygen, sim.res.water, sim.res.food); }
  return { placed, status: sim.status, lost: sim.lostBecause, day: sim.day, budgetLeft: sim.budget, minLife: Math.round(minLife), chain: sim.chain?.map((x) => x.key + (x.params ? JSON.stringify(x.params) : '')).join(' → ') };
}
if (process.argv[1].endsWith('balance_colony.mjs')) {
  for (const [world, ls] of Object.entries(LAYOUTS)) for (const [name, l] of Object.entries(ls)) for (const pen of [false, true]) console.log(world.padEnd(7), name.padEnd(5), pen ? 'penalty' : 'normal ', JSON.stringify(run(world, l, pen)));
  // naive layouts should fail
  for (const world of Object.keys(LAYOUTS)) console.log(world, 'naive', JSON.stringify(run(world, 'solar solar habitat habitat water', false)));
}
