# Launch Window: Concept Document

**Fly the real missions of ISRO and NASA, with real physics.**

## Objective
Launch Window teaches how spaceflight really works. Players fly real missions under the same laws of physics the engineers faced. Nothing is scripted: a wrong burn means a miss, a crash or an empty tank, just as in reality.

## Target audience
All ages. Quick play needs one or two simple controls and no prior knowledge. Expert mode challenges older students and adults.

## Core mechanics
- **Quick play:** 30 short levels on a mission timeline, 1968 to 2025, 22 from ISRO:
  - Hold BOOST to reach orbit, raise Chandrayaan-3's orbit, reach the Moon, or escape Earth with Mangalyaan.
  - Hold BRAKE to be captured by the Moon, Mars, Jupiter or Saturn, steer Apollo 13 home, bring SRE-1 down in the Bay of Bengal, or dock SpaDeX.
  - Hold ENGINE to land Eagle and Vikram; hold PULL UP to land the Pushpak spaceplane.
  - Tap to snap Earthrise and Pluto, drop the Moon Impact Probe, launch in the Mars window, release 104 satellites or open Perseverance's parachute.
  - Two controls: steer the LVM3 launch and drop stages, turn AstroSat, dodge boulders with Vikram, drive Pragyan, balance Aditya-L1 at L1, park INSAT-3DS over India; tap the map to find yourself with NavIC.
- **Quiz to Orbit:** a mini-game where right answers are engine burns toward the real orbital speed of 7.8 km/s.
- **Solar System explorer:** real planet positions, the habitable zone, distances, planet facts and moons.
- **The dotted line** always shows where you will go.
- **Fun layer:** Vyom, a robot guide, coaches you live, explains the physics of every mistake, can fly a level for you and can speak aloud. A debrief graph after every flight, stars, badges, history cards, eleven rocket colours, music and 121 quiz questions with hints.
- **Expert mode:** full missions on their real dates, planning every burn, plus four discovery labs (Galileo's Jupiter, 51 Pegasi b, GW150914, M87*).

## Educational relevance
- **Physics:** Newton's gravity, the rocket equation, Kepler's laws, transfer orbits, gravity assists, Lagrange points, lift and drag, the speed of light, and Mars entry (Mach, dynamic pressure, heating).
- **Honesty:** every simplification is stated in the game (for example, Aditya-L1 is shown in 2D).
- **Proven playable:** automatic tests win every level with 3 stars, using the real physics.

## Tech stack
- **Code:** HTML5 Canvas and JavaScript, bundled by esbuild into one file that works fully offline.
- **Physics engine:** written for the game, with an adaptive Dormand–Prince integrator, finite burns, a Lambert solver, and lander and entry models.
- **Planet positions:** astronomy-engine (VSOP87).
- **Android:** Capacitor. GitHub Actions builds the APK, and the web version is on GitHub Pages.
- **Testing:** 45 unit tests (orbits, rocket equation, every level winnable) and a Playwright test that plays every screen at phone size.
- **Sound:** music and effects synthesised live with Web Audio.
