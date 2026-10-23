/**
 * Spacecraft, engines and the rocket equation.
 *
 * Every burn here is a FINITE burn: thrust F accelerates the craft at F/m
 * while mass drains at ṁ = F / (Isp·g0). A planned Δv therefore takes real
 * time, and the burn's duration follows from Tsiolkovsky's equation:
 *   Δv = Isp·g0·ln(m0/m1)  →  t_burn = (m0·Isp·g0/F)·(1 − e^(−Δv/(Isp·g0)))
 */
import { G0 } from './constants.js';

/** Exhaust velocity (m/s) from specific impulse (s). */
export const ve = (isp) => isp * G0;

/** Δv available from a mass ratio. */
export function deltaV(isp, m0, m1) {
  return ve(isp) * Math.log(m0 / m1);
}

/** Propellant mass needed for Δv starting at mass m0. */
export function propellantFor(dv, isp, m0) {
  return m0 * (1 - Math.exp(-dv / ve(isp)));
}

/** Burn duration to deliver Δv at constant thrust F starting at mass m0. */
export function burnTime(dv, isp, F, m0) {
  return ((m0 * ve(isp)) / F) * (1 - Math.exp(-dv / ve(isp)));
}

/** Total Δv left in the tanks. */
export function dvRemaining(ship, m = ship.mass) {
  return deltaV(ship.engine.isp, m, ship.dryMass);
}

export function createShip(def) {
  return {
    name: def.name,
    mass: def.wetMass,
    wetMass: def.wetMass,
    dryMass: def.dryMass,
    engine: { ...def.engine },
  };
}
