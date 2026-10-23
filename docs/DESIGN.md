# Design decisions: physics model and balance

## Physics model (`src/core/physics.js`)

- **Gravity:** Newtonian, `a = G·M / (r² + ε²)`, summed over every body with mass. `G = 1` in game units, and the softening term `ε` is 2 units by default (per level: `softening`). Softening stops gravity going to infinity at a point. It doesn't change anything visible, because the ship crashes into a body's surface long before that.
- **Integrator:** velocity-Verlet on a **fixed step of 1/120 s** of game time. The frame loop uses an accumulator, so physics is identical at 30, 60 or 120 fps. Level `timeScale` and the 1×/2× button only change how many fixed steps run per real second.
- **Determinism:** the trajectory preview calls the same `stepShip()` as the live sim. A test asserts the preview's end point equals the live sim's end point exactly.
- **Moving bodies:** moons, planets and probes follow *kinematic* circular orbits. Their angular speed is derived from the parent's mass (`ω = √(GM/r³)`), so they always move exactly as gravity says. This keeps levels deterministic, and authors only give a radius and a starting angle.
- **Ship:** negligible mass. Burns are instant changes in velocity (Δv).
- **Fuel:** `cost = |Δv| × fuelPerDv`, proportional to Δv as in real rocketry, so efficient slingshots and two-burn transfers really do save fuel.
- **Atmosphere (aerobraking):** drag `a = −ρ(h)·|v|·v` relative to the planet, with `ρ = ρ₀·e^(−h/H)`. Drag above `heatLimit` damages the hull ("too deep = burn up").
- **CME gusts:** a constant push for a time window, with a 2-second warning. Solar **flares** don't push; they disable the trajectory preview (sensor damage). This is more accurate: a flare is mostly light and radiation.
- **Black holes:** Newtonian gravity right up to the event horizon (`horizon` radius). Crossing it ends the level. This is a simplification noted in the Science Notes (real black holes need general relativity).
- **Accuracy check:** energy drift stays under 1% over 10 circular orbits and 5 eccentric orbits (unit tests).

## Orbit indicator

For the dominant (or target) body: specific energy `E = v²/2 − GM/r`, angular momentum `h`, eccentricity `e = √(1 + 2Eh²/μ²)`, and periapsis/apoapsis from these. The status shown is:
- **ESCAPING** if E ≥ 0
- **FALLING** if the periapsis is below the surface
- **ORBITING** otherwise

## Objective types

| Type | Success when |
|---|---|
| `land` | Touch the target with relative speed ≤ `maxSpeed` |
| `slingshot` | Enter the beacon circle (x, y, r) |
| `orbit` | ORBITING with r in [rMin, rMax] for `hold` s (`strict`: the whole orbit must be in the band) |
| `hohmann`, `aerobrake` | As `orbit`, always strict |
| `lagrange` | Inside the moving L4/L5 zone (60° ahead/behind the planet) for `hold` s |
| `rendezvous` | Within `r` of the probe with relative speed ≤ `maxRelSpeed` |
| `escape` | Distance from target ≥ `distance` |

Failures: crash, burn-up, event horizon, debris (hull ≤ 0), out of bounds (+`margin`), `maxTime` exceeded.

**Star rating:** finishing = ★; fuel left ≥ goal = +★; full hull **and** time ≤ goal = +★.

## Difficulty tracks (`extras.json › tuning`)

| | Cadet | Commander |
|---|---|---|
| Fuel | ×1.3 | ×1.0 |
| Preview | 3.0 s | 2.0 s |
| Hint after | 1 fail | 2 fails |
| Scan charges | +2 | +0 |
| Clue text | plain words | real numbers |

The full 8-second preview unlocks at 6 total stars.

**Solvability:** `npm run solve` brute-forces launch angle × power (plus circularize-at-periapsis/apoapsis and match-velocity second burns) on **Commander** settings. All 8 levels are solvable. Solution counts range from 29 (veil-2, the precise two-burn transfer) to 553 (hollow-3), which gives a rough difficulty curve.

## Colony balance (`colony.json`)

- 1 tick = 1 s, 1 day = 10 ticks, daylight is 60% of each day.
- Crew of 4 needs O₂ 0.5, water 0.3 and food 0.25 per person per tick.
- Base power storage is 20; each battery adds 60.
- Power goes to modules in priority order: O₂ generator → water → greenhouse → comms → shield. Modules without power go OFF, and this is logged to build the cause → effect chain shown on failure.
- Solar output = `5 × world.solar × daylight × events × panelHealth`. Hollow is bright (1.8×), but flares degrade unshielded panels.
- A wrong hypothesis means 60% starting stocks and −3 build points.

**Balance tests:**
- A lean base wins on every world, even with the penalty.
- Removing the greenhouse, water extractor or O₂ generator always loses.
- The "good" Veil layout no longer fits the budget under the penalty, so the player has to plan a leaner base.

## Star science (`stars.js`)

- `L ≈ M^3.5` for M > 0.43 M☉, otherwise `L ≈ 0.23 M^2.3`
- `t ≈ 10 Gyr × M^−2.5`
- Habitable zone ≈ √(L/1.1) to √(L/0.53) AU
- Fate: < 8 M☉ → white dwarf; 8–20 → neutron star; > 20 → black hole
- Brightening: about 10% per Gyr for Sun-like stars, a simplification flagged in the Science Notes

## Story spine (why every disaster points to the star)

- **Cinder:** the asteroid impact is real, but the Orrin *rebuilt above it* (superposition puzzle). They were resilient, so the impact is a red herring for the saga.
- **Veil:** a runaway greenhouse, triggered by a brightening star (salt isotope clock).
- **Hollow:** direct evidence that the star swelled and scoured the planet.
- The FORGE Goldilocks step makes players *experience* the habitable zone moving outward before the story states it. Kiran always gives the timescale straight away (Sun: about 5 billion years; humans: about 300,000 years).
