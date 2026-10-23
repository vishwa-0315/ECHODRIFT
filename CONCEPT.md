# Launch Window: Concept Document

**Fly the real missions of ISRO and NASA, with real physics.**

## Objective
Launch Window teaches how spaceflight really works. Players fly real missions on their real dates, under the same laws of physics the engineers faced. There are no invented worlds and no scripted outcomes: a wrong burn means a miss, a crash or an empty tank, just as in reality.

## Target audience
All ages, from about 10 to adult. Beginners press **Mission Assist** to have each burn planned for them. Advanced players plan burns themselves from the predicted trajectory. Students get a hands-on feel for orbits, fuel limits and astronomy.

## Core mechanics
- **Orbital missions:**
  - Chandrayaan-3: orbit raising, lunar transfer and capture.
  - Mangalyaan: choose a launch window on a porkchop plot, then the Mars capture burn.
  - Aditya-L1: station-keeping at the unstable Sun–Earth L1 point.
  - Apollo 13: get the crew home inside the re-entry corridor.
  - Voyager 2: the Jupiter flyby that reaches Saturn.
- **Burn planning:** choose when, how hard and which way to fire. The dashed path shows exactly what will happen.
- **Landings:**
  - Apollo 11 and Vikram: powered descents with real thrust and fuel.
  - Perseverance: steer the entry with lift, open the parachute inside its real Mach window, then the sky-crane landing.
- **Discovery labs:**
  - Weigh Jupiter from Io's orbit (Galileo, 1610).
  - Find 51 Pegasi b from its star's wobble (1995).
  - Weigh the GW150914 black holes from the chirp (2015).
  - Weigh M87* from its shadow (2019).
- **Solar System explorer:** real planet positions on any date within ±10 years, and the next real Mars launch window.
- **Scoring:** one to three stars for success, fuel saved and matching history. Every mission ends with what really happened, and its sources.

## Educational relevance
- **Gravity:** Newton's gravity from every relevant body, with planets and the Moon at their real positions on each mission's dates.
- **Orbital mechanics:**
  - The rocket equation, with gravity losses visible
  - Kepler's laws
  - Transfer orbits and gravity assists
  - Lagrange points
  - Lambert's problem, which is how launch windows are found
- **Atmospheric entry:** the NASA Glenn Mars atmosphere model, Mach number, dynamic pressure, heating and parachute limits.
- **Honesty:** the game states every simplification. For example, it is 2D, so Aditya-L1's halo orbit appears as its planar cousin, a Lyapunov orbit.
- **Proven playable:** an automatic test flies every mission with the real fuel load. The player's Chandrayaan-3 can reach lunar orbit on 5 August 2023, the real date.

## Tech stack
- **Code:** HTML5 Canvas and JavaScript, bundled by esbuild into one file that works fully offline.
- **Physics engine:** written for the game, with an adaptive Dormand–Prince integrator, finite burns, a Lambert solver, and lander and entry models.
- **Planet positions:** astronomy-engine (VSOP87).
- **Android:** Capacitor. GitHub Actions builds the APK, and the web version is on GitHub Pages.
- **Testing:** 21 physics unit tests, an autopilot that proves every mission can be completed, and a Playwright test that plays every screen at phone size.
