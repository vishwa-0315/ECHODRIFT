/**
 * ECHO DRIFT — INVESTIGATE: clue scanning + Case Board hypothesis scoring (pure).
 *
 * Every clue carries `weights` per hypothesis (-3 … +3). Players pin clues to
 * hypothesis slots. The "evidence strength" of a hypothesis is the sum of the
 * weights *for that hypothesis* of the clues pinned to it, so pinning a
 * red-herring clue to the right answer gives little support (weight ~0) and
 * pinning a contradicting clue lowers it.
 */

export const HYPOTHESES = ['impact', 'greenhouse', 'stellar', 'volcanism', 'unknown'];

/** Which clue (if any) a tool reveals at a hotspot. */
export function scanResult(investigation, hotspotId, toolId) {
  return investigation.clues.find((c) => c.hotspot === hotspotId && c.tool === toolId) || null;
}

/** Evidence strength per hypothesis for the current board. board = {hyp: [clueId,...]} */
export function evidenceScores(board, clues) {
  const byId = Object.fromEntries(clues.map((c) => [c.id, c]));
  const out = {};
  for (const h of HYPOTHESES) {
    out[h] = (board[h] || []).reduce((sum, id) => sum + (byId[id]?.weights?.[h] ?? 0), 0);
  }
  return out;
}

/** The hypothesis the *collected* evidence best supports (regardless of pins). */
export function bestSupported(collectedIds, clues) {
  const byId = Object.fromEntries(clues.map((c) => [c.id, c]));
  let best = null;
  let bestScore = -Infinity;
  for (const h of HYPOTHESES) {
    if (h === 'unknown') continue;
    const s = collectedIds.reduce((sum, id) => sum + (byId[id]?.weights?.[h] ?? 0), 0);
    if (s > bestScore) {
      bestScore = s;
      best = h;
    }
  }
  return { hypothesis: best, score: bestScore };
}

/**
 * Judge a submitted hypothesis.
 * Returns { result: 'correct' | 'wrong' | 'unknown', strength, needMore }
 *  - needs at least `minEvidence` clues pinned to the chosen hypothesis
 *    (except 'unknown', which is an honest, allowed answer).
 */
export function judgeHypothesis(investigation, board, chosen, minEvidence = 2) {
  const scores = evidenceScores(board, investigation.clues);
  const pinned = (board[chosen] || []).length;
  if (chosen !== 'unknown' && pinned < minEvidence) return { result: 'needMore', strength: scores[chosen], needMore: minEvidence - pinned };
  if (chosen === 'unknown') return { result: 'unknown', strength: 0 };
  return {
    result: chosen === investigation.answer ? 'correct' : 'wrong',
    strength: scores[chosen],
  };
}

/** Rock-layer superposition puzzle: is `order` (top→bottom ids) correct? */
export function checkLayerOrder(puzzle, order) {
  const correct = puzzle.layers.map((l) => l.id);
  return order.length === correct.length && order.every((id, i) => id === correct[i]);
}

/** Glyph puzzle: the Orrin count in binary dots and primes. */
export function checkGlyph(glyph, answer) {
  return Number(answer) === Number(glyph.answer);
}

/** Generate the first n primes (used to build/verify glyph sequences). */
export function primes(n) {
  const out = [];
  for (let k = 2; out.length < n; k++) if (out.every((p) => k % p)) out.push(k);
  return out;
}
