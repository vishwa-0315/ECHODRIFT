/**
 * Physical constants (SI). Sources: IAU 2015 nominal values / NASA JPL.
 */
export const G = 6.6743e-11; // m^3 kg^-1 s^-2 (CODATA 2018)
export const G0 = 9.80665; // standard gravity, m/s^2 (defines specific impulse)
export const C = 299792458; // speed of light, m/s
export const AU = 149597870700; // m (IAU 2012)
export const DAY = 86400; // s
export const YEAR = 365.25 * DAY; // Julian year, s
export const LY = C * YEAR; // light-year, m
export const PC = 3.0856775814913673e16; // parsec, m
export const MSUN = 1.98847e30; // kg
export const MJUP = 1.89813e27; // kg

/** Gravitational parameters GM (m^3/s^2), JPL DE440 values. */
export const MU = {
  sun: 1.32712440041279e20,
  mercury: 2.2031868551e13,
  venus: 3.24858592e14,
  earth: 3.98600435507e14,
  moon: 4.902800118e12,
  mars: 4.2828375816e13,
  jupiter: 1.26712764e17, // Jupiter system barycentre
  saturn: 3.7940584841e16,
  uranus: 5.794556e15,
  neptune: 6.836527e15,
};

/** Mean (volumetric) radii, m (NASA planetary fact sheet). */
export const RADIUS = {
  sun: 695700e3,
  mercury: 2439.7e3,
  venus: 6051.8e3,
  earth: 6371.0e3,
  moon: 1737.4e3,
  mars: 3389.5e3,
  jupiter: 69911e3,
  saturn: 58232e3,
  uranus: 25362e3,
  neptune: 24622e3,
};

/** Equatorial radii used for altitude references (m). */
export const RADIUS_EQ = { earth: 6378.137e3, moon: 1737.4e3, mars: 3396.19e3, jupiter: 71492e3, saturn: 60268e3 };
