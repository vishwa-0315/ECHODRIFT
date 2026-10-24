# Launch Window

**Fly the real missions of ISRO and NASA, with real physics.**
Chandrayaan-3 · Vikram · Mangalyaan · Aditya-L1 · Apollo 11 · Apollo 13 · Voyager 2 · Perseverance, plus four discovery labs and a live Solar System explorer.

- **Play in a browser:** https://vishwa-0315.github.io/ECHODRIFT/
- **Android APK:** latest release on the [Releases page](../../releases/latest). Download `LaunchWindow-buildN.apk` on your phone and open it; allow "Install unknown apps" when asked. Needs Android 7.0 or newer.
- **Concept document (≤ 500 words):** [CONCEPT.md](CONCEPT.md)

> The earlier fictional prototype, *ECHO DRIFT*, lives on the [`echo-drift`](../../tree/echo-drift) branch.

## How it plays
- **Quick play (for everyone):** 20 short levels on a mission timeline from 1968 to 2025 (Earthrise, Apollo 11 and 13, Voyager 2, SLV-3, Cassini, Chandrayaan-1, Mangalyaan, New Horizons, Juno, PSLV-C37, Perseverance, Chandrayaan-3, SpaDeX), one big button each, plus the coming missions (Gaganyaan, Chandrayaan-4, Artemis, Shukrayaan, Bharatiya Antariksh Station).
- **Quiz to Orbit:** a mini-game where right answers are engine burns: reach the real orbital speed of 7.8 km/s.
- **Solar System explorer:** real planet positions on any date, the habitable zone, distances between any planets, full planet facts and their main moons.
- **Smart camera:** zooms in on flybys and captures, with a close-up window and Auto / Wide / Follow modes.
- **Vyom**, a friendly robot guide, explains every level, mission and lab, and can fly a level for you ("Watch Vyom").
- **Rewards:** stars, 9 badges, 10 rocket colours to unlock, music and sound effects, and a quiz card after every level (55 questions).
- **Expert mode:** the full missions on their real dates, where you plan every burn yourself, plus four discovery labs.

## What makes it different
- **Real places and dates.** Planets and the Moon are where they really were on each mission's dates (astronomy-engine, VSOP87).
- **Real physics, nothing scripted.**
  - Newtonian n-body gravity, flown with an adaptive Dormand–Prince integrator.
  - Finite engine burns that follow the rocket equation.
  - The dashed prediction uses exactly the same model as the flight.
- **Proven flyable.** `npm run solve` flies every mission with the real fuel load, using only Mission Assist, and checks that it succeeds.
- **Honest.** Every mission lists its sources and states each simplification. For example, the game is 2D, and some spacecraft masses and engine efficiencies are public estimates.

## Build it yourself
```bash
npm install
npm test            # physics unit tests
npm run solve       # autopilot proves every mission is achievable
npm run build       # dist/index.html: one offline file, open it in any browser
npm run e2e         # plays every screen in headless Chromium (needs Chromium)
npm run android:sync && npm run android:open   # Android Studio
```
Every push to `main` builds the APK and publishes the web version (`.github/workflows/build.yml`).

## Project layout
| Path | What |
|---|---|
| `src/core/` | Physics: integrator, orbits and Lambert, ephemerides, rocket, lander, Mars entry, labs, targeting |
| `src/missions/` | Mission definitions, Mission Assist, autopilot |
| `src/ui/` | Screens (home, briefing, orbital, porkchop, lander, entry, labs, explorer, about) |
| `content/missions.json` | Mission stories, real figures, history, sources |
| `tools/` | Build, mission design, solvers, end-to-end test, icon generator |
| `tests/` | Physics tests |

## Credits
- **Images:** Earth from NASA Blue Marble and the Moon from the NASA LRO/Clementine mosaic, both public domain.
- **Ephemerides:** astronomy-engine by Don Cross (MIT licence).
- **Font:** Inter by Rasmus Andersson (SIL Open Font Licence).
- **Mission facts:** ISRO and NASA/JPL, cited on each mission.
