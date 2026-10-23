/**
 * Discovery labs: the real formulas scientists used, applied to real data.
 */
import { G, C, MSUN, MJUP, DAY } from './constants.js';

/** Kepler's third law → mass of the central body: M = 4π²a³ / (G T²). */
export function keplerMass(aMeters, periodSeconds) {
  return (4 * Math.PI ** 2 * aMeters ** 3) / (G * periodSeconds ** 2);
}

/** Radial-velocity method → minimum planet mass (circular orbit, planet ≪ star). */
export function rvMinMass(K, periodSeconds, starMassKg) {
  return K * Math.cbrt(periodSeconds / (2 * Math.PI * G)) * starMassKg ** (2 / 3);
}

/** Orbit size from period and star mass (Kepler III). */
export function orbitRadius(periodSeconds, starMassKg) {
  return Math.cbrt((G * starMassKg * periodSeconds ** 2) / (4 * Math.PI ** 2));
}

/** A spinning body can't be less dense than this or it flies apart: ρ ≥ 3π/(G P²). */
export function minDensityForSpin(periodSeconds) {
  return (3 * Math.PI) / (G * periodSeconds ** 2);
}

/** Gravitational-wave chirp mass from frequency f (Hz) and its rate ḟ (Hz/s). */
export function chirpMass(f, fdot) {
  return (C ** 3 / G) * ((5 / 96) * Math.PI ** (-8 / 3) * f ** (-11 / 3) * fdot) ** (3 / 5);
}

/** Leading-order (Newtonian) chirp: GW frequency τ seconds before merger. */
export function chirpFrequency(tau, Mc) {
  return (1 / (8 * Math.PI)) * (5 / tau) ** (3 / 8) * ((G * Mc) / C ** 3) ** (-5 / 8);
}

/** Chirp mass of two masses. */
export function chirpMassOf(m1, m2) {
  return (m1 * m2) ** (3 / 5) / (m1 + m2) ** (1 / 5);
}

/**
 * Black-hole mass from the angular diameter of its shadow (non-spinning):
 * shadow diameter = 2√27·GM/c²  →  M = θ·D·c² / (2√27·G)
 */
export function blackHoleMassFromShadow(thetaMicroArcsec, distanceMeters) {
  const theta = (thetaMicroArcsec * 1e-6 * Math.PI) / (180 * 3600);
  return (theta * distanceMeters * C ** 2) / (2 * Math.sqrt(27) * G);
}

export const units = { MSUN, MJUP, DAY };
