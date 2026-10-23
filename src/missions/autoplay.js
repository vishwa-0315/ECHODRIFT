/**
 * Autopilot: flies an orbital mission using only Mission Assist and the real
 * simulator. Used to prove every mission is achievable, and for the in-game
 * "Watch Mission Assist fly it" demo.
 */
import { DAY } from '../core/constants.js';

export function runStageChecks(mission, sim, ctx, done) {
  for (const st of mission.stages) {
    if (done.has(st.id)) continue;
    const r = st.check(sim, ctx);
    if (r === 'done') {
      done.add(st.id);
      (mission.doneAt ||= {})[st.id] = sim.t;
    }
    if (r === 'fail') return { fail: st.id };
  }
  return null;
}

export function autoplay(mission, { log = () => {}, maxIter = 400, includeBonus = true } = {}) {
  const sim = mission.sim;
  const done = new Set();
  const ctx = { prediction: null };
  const refresh = () => (ctx.prediction = sim.predict(mission.predictHorizon(sim), DAY / 4));
  refresh();
  const order = mission.stages.filter((s) => includeBonus || !s.bonus);
  for (let it = 0; it < maxIter; it++) {
    if (sim.status !== 'flying') break;
    const f = runStageChecks(mission, sim, ctx, done);
    if (f) return { ok: false, reason: 'fail:' + f.fail, done, sim };
    const stage = order.find((s) => !done.has(s.id));
    if (!stage) break;
    if (mission.endOn === 'entry' && done.has(mission.successStage) && (!includeBonus || done.has('pc2'))) {
      // nothing left to burn: coast to entry
      sim.advance(mission.predictHorizon(sim));
      break;
    }
    const onTrack = stage.onTrack ? stage.onTrack(sim, ctx) : false;
    const ready = stage.ready ? stage.ready(sim, ctx) : true;
    const plan = stage.assist && !onTrack && ready ? stage.assist(sim) : null;
    if (plan && plan.length) {
      for (const n of plan) sim.addNode(n);
      const last = sim.nodes[sim.nodes.length - 1];
      log(`${stage.id}: burn ${plan.map((n) => n.dv.toFixed(2) + ' m/s').join(', ')} at ${sim.date(plan[0].t).toISOString().slice(0, 16)}`);
      sim.advance(Math.max(600, last.t - sim.t + (stage.afterBurnCoast ?? 3 * 3600)));
    } else {
      // nothing to burn right now: coast forward
      const step = stage.coastStep ? stage.coastStep(sim, ctx) : stage.id === 'hold' ? 30 * DAY : stage.id === 'saturn' ? 30 * DAY : 0.25 * DAY;
      if (globalThis.__AUTOPLAY_DEBUG) log(`  coast ${stage.id} ${(step / 3600).toFixed(1)} h, plan ${plan ? 'empty' : 'none'}`);
      sim.advance(step);
    }
    refresh();
  }
  runStageChecks(mission, sim, ctx, done);
  if (mission.endOn === 'entry' && sim.status === 'flying') sim.advance(mission.predictHorizon(sim));
  const ok = mission.finalVerdict ? mission.finalVerdict(sim) === 'ok' : done.has(mission.successStage);
  return { ok, done, sim, stars: ok ? mission.stars(sim, done) : 0 };
}
