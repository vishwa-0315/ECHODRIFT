/**
 * ECHO DRIFT — offline real-sky helpers ("Look Up Tonight", Light Ruler,
 * Planet Hunter). Pure functions.
 */

const SYNODIC = 29.530588853; // days
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC

/** Moon age in days (0 = new) and illuminated fraction for a Date. */
export function moonPhase(date) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const illum = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  let name;
  if (age < 1.85 || age >= 27.68) name = 'new';
  else if (age < 5.54) name = 'waxingCrescent';
  else if (age < 9.23) name = 'firstQuarter';
  else if (age < 12.92) name = 'waxingGibbous';
  else if (age < 16.61) name = 'full';
  else if (age < 20.3) name = 'waningGibbous';
  else if (age < 23.99) name = 'lastQuarter';
  else name = 'waningCrescent';
  return { age, illum, name };
}

/** Light travel time in seconds for a distance in metres. */
export const C = 299792458;
export const LY_M = 9.4607e15;

/** Pretty light-time from seconds → {value, unit} (s, min, h, days, years). */
export function lightTime(seconds) {
  if (seconds < 120) return { value: seconds, unit: 's' };
  if (seconds < 7200) return { value: seconds / 60, unit: 'min' };
  if (seconds < 172800) return { value: seconds / 3600, unit: 'h' };
  if (seconds < 3.156e7 * 2) return { value: seconds / 86400, unit: 'd' };
  return { value: seconds / 3.156e7, unit: 'y' };
}

/** Round-trip message delay in years for a distance in light-years. */
export function roundTripYears(ly) {
  return 2 * ly;
}

/**
 * Synthetic transit light curve. planets: [{period, depth, phase, duration}]
 * Returns Float32Array of brightness samples over [0, span) days, with
 * deterministic noise from a seed.
 */
export function lightCurve(planets, span, samples, noise = 0.0015, seed = 7) {
  const out = new Float32Array(samples);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * span;
    let b = 1;
    for (const p of planets) {
      const ph = (((t - p.phase) % p.period) + p.period) % p.period;
      if (ph < p.duration) b -= p.depth;
    }
    out[i] = b + rand() * noise * 2;
  }
  return out;
}

/** Planet radius relative to its star from transit depth: Rp/Rs = sqrt(depth). */
export function radiusRatioFromDepth(depth) {
  return Math.sqrt(depth);
}
