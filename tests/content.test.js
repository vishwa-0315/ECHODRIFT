// Content, i18n and balance tests. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadContent } from '../tools/load_content.mjs';
import { lintContent } from '../src/core/validate.js';
import { run, LAYOUTS } from '../tools/balance_colony.mjs';

const content = loadContent();
const root = new URL('..', import.meta.url).pathname;

test('all content passes the linter', () => {
  assert.deepEqual(lintContent(content), []);
});

test('linter catches a broken level', () => {
  const broken = structuredClone(content);
  broken.flight[0].objective.target = 'nowhere';
  delete broken.flight[1].goals;
  const errs = lintContent(broken);
  assert.ok(errs.some((e) => e.includes('objective target "nowhere"')));
  assert.ok(errs.some((e) => e.includes('goals: missing required field')));
});

function srcFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? srcFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('every UI string key used in code exists in English', () => {
  const en = content.lang.en.ui;
  const missing = [];
  const families = {
    'col.cant.': ['occupied', 'budget', 'unavailable', 'over'],
    'colony.event.': content.colony.worlds.flatMap((w) => w.events.map((e) => e.id)),
    'colony.chain.': ['night', 'power', 'offline', 'none', 'notEnough', 'zero'],
    'fly.fail.': ['crash', 'burnup', 'horizon', 'lost', 'timeout', 'debris'],
    'fly.objective.': [...new Set(content.flight.map((l) => l.objective.type))],
    'hyp.': ['impact', 'greenhouse', 'stellar', 'volcanism', 'unknown'],
    'hypd.': ['impact', 'greenhouse', 'stellar', 'volcanism', 'unknown'],
    'log.': ['fragments', 'facts', 'clues', 'gallery', 'badges'],
    'moon.': ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent'],
    'num.': ['47', '83', '29', '64', '91', '38'],
    'orbit.': ['orbiting', 'escaping', 'falling', 'drifting'],
    'par.hyp.': ['correct', 'wrong', 'unknown'],
    'par.src.': ['flight', 'layers', 'case', 'colony', 'report', 'forge', 'quiz'],
    'phase.': ['fly', 'investigate', 'build', 'report', 'forge'],
    'res.': ['power', 'water', 'oxygen', 'food', 'morale'],
    'tool.': ['spectrometer', 'drill', 'radiation', 'crater', 'thermal'],
    'unit.': ['s', 'min', 'h', 'd', 'y'],
  };
  for (const f of srcFiles(join(root, 'src'))) {
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) {
      const key = m[1];
      if (key.endsWith('.')) {
        assert.ok(families[key], `dynamic key family "${key}" in ${f} is not listed in this test`);
        for (const k of families[key]) if (!(key + k in en)) missing.push(key + k);
      } else if (!(key in en)) missing.push(`${key} (${f.replace(root, '')})`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('translations only use keys that exist in English (no typos)', () => {
  for (const lang of ['hi', 'ta']) {
    const extra = Object.keys(content.lang[lang].ui).filter((k) => !(k in content.lang.en.ui));
    assert.deepEqual(extra, [], lang);
  }
});

test('translations keep the same {placeholders} as English', () => {
  for (const lang of ['hi', 'ta'])
    for (const [k, v] of Object.entries(content.lang[lang].ui)) {
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
      assert.equal(ph(v), ph(content.lang.en.ui[k]), `${lang}:${k}`);
    }
});

test('every colony is winnable with a lean base, even after a wrong hypothesis', () => {
  for (const world of Object.keys(LAYOUTS)) {
    assert.equal(run(world, LAYOUTS[world].lean, false).status, 'won', world);
    assert.equal(run(world, LAYOUTS[world].lean, true).status, 'won', world + ' (penalty)');
  }
});

test('every life-support module matters (removing it loses)', () => {
  for (const world of Object.keys(LAYOUTS)) {
    const base = LAYOUTS[world].good.split(' ');
    for (const drop of ['greenhouse', 'water', 'o2gen']) {
      const i = base.indexOf(drop);
      const r = run(world, base.filter((_, k) => k !== i).join(' '), false);
      assert.equal(r.status, 'lost', `${world} without ${drop}`);
    }
  }
});

test('every flight level is solvable on Commander (no fuel bonus)', { timeout: 180000 }, () => {
  const out = execFileSync('node', [join(root, 'tools/solve_levels.mjs')], { encoding: 'utf8' });
  assert.ok(!out.includes('UNSOLVED'), out);
  assert.equal((out.match(/SOLVABLE/g) || []).length, content.flight.length);
});

test('investigations: answer is the best-supported hypothesis given ALL clues', async () => {
  const { bestSupported } = await import('../src/core/caseboard.js');
  for (const inv of Object.values(content.investigations)) {
    assert.equal(bestSupported(inv.clues.map((c) => c.id), inv.clues).hypothesis, inv.answer, inv.world);
    // and it is still reachable with the minimum charges on Commander
    const supporting = inv.clues.filter((c) => (c.weights[inv.answer] || 0) > 0).length;
    assert.ok(supporting >= 2 && inv.charges >= 2, inv.world);
  }
});

test('quiz answers are not always the same position', () => {
  const pos = Object.values(content.quizzes).flatMap((q) => q.questions.map((x) => x.correct));
  assert.ok(new Set(pos).size > 1);
});
