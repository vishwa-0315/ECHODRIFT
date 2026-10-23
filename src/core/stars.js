/**
 * ECHO DRIFT — FORGE star science (pure; unit-tested).
 *
 * Simplifications (documented in SCIENCE_NOTES):
 *  - Main-sequence luminosity  L ≈ M^3.5 (M > 0.43 Msun), L ≈ 0.23 M^2.3 below.
 *  - Main-sequence lifetime    t ≈ 10 Gyr × M^-2.5.
 *  - Habitable zone edges      inner ≈ sqrt(L/1.1) AU, outer ≈ sqrt(L/0.53) AU.
 *  - Fate by initial mass: < 8 Msun → white dwarf; 8–20 → supernova → neutron
 *    star; > 20 → supernova → black hole (real boundaries are fuzzy).
 */

export function luminosity(mass) {
  return mass > 0.43 ? Math.pow(mass, 3.5) : 0.23 * Math.pow(mass, 2.3);
}

/** Main-sequence lifetime in years. */
export function lifetimeYears(mass) {
  return 1e10 * Math.pow(mass, -2.5);
}

export function habitableZone(lum) {
  return { inner: Math.sqrt(lum / 1.1), outer: Math.sqrt(lum / 0.53) };
}

/** Classify a star by mass (solar masses). Returns a type id used by content. */
export function starType(mass) {
  if (mass < 0.08) return 'browndwarf';
  if (mass < 0.5) return 'reddwarf';
  if (mass < 1.5) return 'sunlike';
  if (mass < 8) return 'whitestar';
  return 'bluegiant';
}

/** Life story stages for the time-lapse. */
export function lifeStages(mass) {
  const type = starType(mass);
  if (type === 'browndwarf') return ['browndwarf'];
  if (type === 'reddwarf') return ['reddwarf', 'slowfade', 'whitedwarf'];
  if (mass < 8) return [type, 'redgiant', 'nebula', 'whitedwarf'];
  if (mass < 20) return [type, 'supergiant', 'supernova', 'neutronstar'];
  return [type, 'supergiant', 'supernova', 'blackhole'];
}

/**
 * Evaluate a furnace recipe.
 * recipe = { mass, ingredients: {H, He, C, O, Fe} } (ingredient counts)
 * requirement = { types: [...], minHydrogen }
 */
export function cookStar(recipe, requirement) {
  const ing = recipe.ingredients || {};
  if ((ing.Fe || 0) > 0) return { ok: false, fizzle: true, reason: 'iron' };
  const type = starType(recipe.mass);
  if (type === 'browndwarf') return { ok: false, type, reason: 'tooSmall', stages: lifeStages(recipe.mass) };
  if ((ing.H || 0) < (requirement?.minHydrogen ?? 1)) return { ok: false, type, reason: 'noFuel' };
  const lum = luminosity(recipe.mass);
  const res = {
    ok: !requirement || requirement.types.includes(type),
    type,
    mass: recipe.mass,
    luminosity: lum,
    lifetime: lifetimeYears(recipe.mass) * (1 + 0.04 * Math.min(5, (ing.H || 0) - 1)),
    stages: lifeStages(recipe.mass),
    zone: habitableZone(lum),
  };
  if (!res.ok) res.reason = 'wrongType';
  return res;
}

/**
 * A Sun-like star brightens ~10% per billion years. Returns luminosity after
 * `gyr` billion years of main-sequence life (simple compound model).
 */
export function brightenedLuminosity(lum0, gyr) {
  return lum0 * Math.pow(1.1, gyr);
}
