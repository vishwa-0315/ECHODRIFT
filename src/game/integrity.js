/**
 * Integrity helpers.
 *
 * The game runs offline, so progress lives on the device. To make editing it
 * pointless, every save is sealed: a fingerprint of the stars, certificates and
 * profile name is stored with it. If anyone changes the saved data outside the
 * game, the fingerprint no longer matches, the progress is marked as changed and
 * certificates stay locked until it is reset.
 *
 * Certificates carry a verification code computed from the name, tier, stars,
 * missions and date: editing any of those on the picture breaks the code, which
 * anyone can check in the game ("Verify a certificate").
 *
 * This is tamper-evident, not tamper-proof: a determined programmer with the
 * source code could still forge data. Full proof would need an online server.
 */

const SALT = 'LW-yassc26·vyom·orbit-7.8';

/** 64-bit fingerprint (two independent 32-bit FNV-1a passes with different seeds), as base-36. */
export function fingerprint(text) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  const s = SALT + '|' + text;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ ((c * 31 + i) & 0xffff), 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return (a.toString(36) + b.toString(36)).toUpperCase().padStart(12, '0').slice(-12);
}

/** What the seal protects: everything that earns a certificate. */
function sealText(save) {
  const ar = save.arcade || {};
  const stars = Object.keys(ar.stars || {})
    .sort()
    .map((k) => `${k}:${ar.stars[k]}`)
    .join(',');
  const certs = Object.keys(ar.certs || {})
    .sort()
    .map((k) => `${k}:${ar.certs[k]}`)
    .join(',');
  const cards = Object.keys(ar.cards || {}).sort().join(',');
  const proofs = Object.keys(ar.proof || {})
    .sort()
    .map((k) => `${k}:${ar.proof[k].s}:${ar.proof[k].n}`)
    .join(',');
  return [stars, certs, cards, proofs, ar.quizRight || 0, ar.tampered ? 'T' : '', (save.profile || {}).name || ''].join('#');
}

export const sealOf = (save) => fingerprint(sealText(save));

/** Check a save loaded from storage; marks it if it was changed outside the game. */
export function checkSeal(save) {
  const ar = save.arcade;
  if (!ar) return;
  if (!ar.seal) return; // saves from before sealing existed are trusted once, then sealed
  if (ar.seal !== sealOf(save)) {
    ar.tampered = true;
  }
}

/* ---------- certificate verification codes ----------
 * The code carries the certificate's facts (tier, stars, missions, date) plus a
 * check made from them and the player's name. "Verify a certificate" reads the
 * facts back from the code, so anyone can compare them with the picture.     */
const EPOCH = Date.UTC(2026, 0, 1);
const TIERS = ['bronze', 'silver', 'gold', 'platinum'];
const norm = (name) => name.replace(/\s+/g, ' ').trim().toLowerCase();
const b36 = (n, len) => n.toString(36).toUpperCase().padStart(len, '0');

export function certCode({ name, tier, stars, levels, when }) {
  const day = Math.max(0, Math.min(4095, Math.floor((when - EPOCH) / 86400000)));
  const payload = ((((day * 128 + stars) * 32 + levels) * 4) + TIERS.indexOf(tier)) >>> 0;
  const p = b36(payload, 6);
  const chk = fingerprint(['CERT', norm(name), p].join('|')).slice(0, 5);
  return `${p.slice(0, 3)}${chk.slice(0, 2)}-${p.slice(3)}${chk.slice(2)}`;
}

/** Returns the facts in a code if it matches the name, else null. */
export function readCertCode(name, code) {
  const c = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (c.length !== 11) return null;
  const p = c.slice(0, 3) + c.slice(5, 8), chk = c.slice(3, 5) + c.slice(8);
  if (fingerprint(['CERT', norm(name), p].join('|')).slice(0, 5) !== chk) return null;
  let v = parseInt(p, 36);
  const tier = TIERS[v % 4];
  v = Math.floor(v / 4);
  const levels = v % 32;
  v = Math.floor(v / 32);
  const stars = v % 128;
  const day = Math.floor(v / 128);
  return { tier, levels, stars, date: new Date(EPOCH + day * 86400000) };
}
