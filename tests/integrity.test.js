// Integrity: sealed saves detect outside edits; certificate codes can't be altered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealOf, checkSeal, certCode, readCertCode } from '../src/game/integrity.js';

const save = () => ({ arcade: { stars: { rohini: 3, eagle: 2 }, proof: { rohini: { s: 3, n: 1 }, eagle: { s: 2, n: 2 } }, certs: {}, cards: {}, quizRight: 4 }, profile: { name: 'Asha' } });

test('an untouched save passes its seal', () => {
  const s = save();
  s.arcade.seal = sealOf(s);
  checkSeal(s);
  assert.equal(!!s.arcade.tampered, false);
});

test('editing stars, the name or the quiz score outside the game is detected', () => {
  for (const edit of [(s) => (s.arcade.stars.juno = 3), (s) => (s.profile.name = 'Someone else'), (s) => (s.arcade.quizRight = 99), (s) => (s.arcade.proof.juno = { s: 3, n: 1 })]) {
    const s = save();
    s.arcade.seal = sealOf(s);
    edit(s);
    checkSeal(s);
    assert.equal(s.arcade.tampered, true);
  }
});

test('certificate codes carry their facts and only match the right name', () => {
  const when = Date.UTC(2026, 9, 25);
  const code = certCode({ name: 'Vishwa D', tier: 'gold', stars: 82, levels: 30, when });
  const r = readCertCode('  vishwa   d ', code);
  assert.deepEqual([r.tier, r.stars, r.levels, r.date.getTime()], ['gold', 82, 30, when]);
  assert.equal(readCertCode('Vishwa E', code), null);
  // changing any character of the code breaks it
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '-') continue;
    const bad = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
    assert.equal(readCertCode('Vishwa D', bad), null, bad);
  }
});
