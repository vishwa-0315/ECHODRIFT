# Launch Window: Concept Document

**Fly the real missions of ISRO and NASA, with real physics.**

## Objective
Launch Window teaches how spaceflight really works. Players fly real missions on their real dates, under the same laws of physics the engineers faced. There are no invented worlds and no scripted outcomes: a wrong burn means a miss, a crash or an empty tank, just as in reality.

## Target audience
All ages. Quick play needs one button and no prior knowledge. Expert mode challenges older students and adults.

## Core mechanics
- **Quick play:** 20 short levels on a mission timeline, 1968 to 2025, each with one big button:
  - Hold BOOST to reach orbit (SLV-3), raise Chandrayaan-3's orbit, reach the Moon, or escape Earth with Mangalyaan.
  - Hold BRAKE to be captured by the Moon, Mars, Jupiter (Juno) or Saturn (Cassini), steer Apollo 13 home, or dock SpaDeX gently.
  - Hold ENGINE to land Apollo 11's Eagle and Vikram, and repeat Vikram's 40 cm hop.
  - Tap to snap Earthrise and Pluto, drop Chandrayaan-1's impact probe, launch in the Mars window, release PSLV-C37's 104 satellites, or open Perseverance's parachute.
  - Aim a Jupiter slingshot to reach Saturn.
- **Quiz to Orbit:** a mini-game where right answers are engine burns toward the real orbital speed of 7.8 km/s.
- **Solar System explorer:** real planet positions, the habitable zone, distances, planet facts and moons.
- **The dotted line** always shows where you will go. A smart camera zooms in on the action.
- **Fun layer:** Vyom, a robot guide, gives tips on every screen and can fly a level for you. Stars, badges, ten rocket colours, music and a quiz card after every level.
- **Expert mode:** full missions on their real dates, planning every burn, plus four discovery labs (Galileo's Jupiter, 51 Pegasi b, GW150914, M87*).

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
- **Proven playable:** automatic tests win every level and every mission with the real physics and real fuel.

## Tech stack
- **Code:** HTML5 Canvas and JavaScript, bundled by esbuild into one file that works fully offline.
- **Physics engine:** written for the game, with an adaptive Dormand–Prince integrator, finite burns, a Lambert solver, and lander and entry models.
- **Planet positions:** astronomy-engine (VSOP87).
- **Android:** Capacitor. GitHub Actions builds the APK, and the web version is on GitHub Pages.
- **Testing:** 45 unit tests (orbits, rocket equation, every level winnable) and a Playwright test that plays every screen at phone size.
- **Sound:** music and effects synthesised live with Web Audio.
