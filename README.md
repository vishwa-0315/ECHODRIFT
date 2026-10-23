# ECHO DRIFT

An educational space-mystery game for ages 10–16. A strange signal leads your crew through the dead worlds of the Orrin civilization. You fly with real gravity, investigate ruins like a detective, keep a colony alive, talk to Earth across a light-speed delay, and forge stars. The game never announces a lesson: players learn the physics because they need it to win.

**v1 is a vertical slice:** 3 full worlds (Cinder, Veil, Hollow) and 5 "coming soon" teasers (Tides, Ice, Spore, Glass, Origin). It's fully offline, with no ads, no purchases, no chat and no data collection.

---

## Quick start

You need **Node.js 20 or newer** (22 LTS recommended).

```bash
npm install          # tools + Capacitor
npm test             # 35 unit/content/balance tests (incl. "every level is solvable")
npm run build        # → dist/index.html (single offline file) + www/index.html
```

To play in a browser, open `dist/index.html` directly (double-click it). No server is needed.

## Build the Android app (APK / AAB)

The `android/` folder is a ready-made Capacitor 8 project (min SDK 24, target SDK 36).

1. Install **Android Studio** (it includes the Android SDK and a JDK).
2. Run:
   ```bash
   npm install
   npm run android:sync     # builds the game and copies it into android/
   npm run android:open     # opens the project in Android Studio
   ```
3. In Android Studio:
   - Debug APK: **Build › Build App Bundle(s) / APK(s) › Build APK(s)**, then run on an emulator or phone.
   - Release AAB for Google Play: **Build › Generate Signed App Bundle / APK** (create an upload key the first time).
   - From the command line: `cd android && ./gradlew assembleDebug` (APK) or `./gradlew bundleRelease` (AAB). On Windows use `gradlew.bat`.

After every content or code change, run `npm run android:sync` again.

## Project layout

```
content/                 ← ALL game content (edit these, not code)
  worlds.json            worlds, map positions, learning objectives + curriculum tags
  flight_levels.json     every FLY level (bodies, ship, objective, fuel, hazards, goals, hints)
  investigations.json    scenes, hotspots, clues (+ hypothesis weights), rock layers, glyphs
  colony.json            modules, rates, crew needs, per-world solar/events/budget
  report.json            Light Ruler, Earth questions/answers, signal puzzles, Planet Hunter
  forge.json             ingredients, star types, stage text, per-world star orders
  quizzes.json           Mission Debrief questions (each tagged with the misconception it checks)
  dialogue.json          crew, all story scenes, crash/success quips, Orrin fragments
  science_notes.json     every fact + source + "what we simplified"
  extras.json            difficulty tuning, Real Space gallery, Look Up Tonight, badges
  lang/en.json hi.json ta.json   UI strings + content translations
  _template_world/       copy-me template for a new world
src/
  core/                  pure game logic (no DOM), fully unit-tested
    physics.js           n-body gravity, velocity-Verlet, fixed timestep, drag, CME gusts
    flight.js            fuel (Δv), hull, burns, hazards, 8 objective types, star rating
    colony.js            resource simulation, power priority, events, chain-reaction explainer
    caseboard.js         scanning, evidence scoring, hypothesis judging, layers, primes
    stars.js             luminosity, lifetime, habitable zone, star type, life stages
    sky.js               Moon phase, light-time, transit light curves
    save.js              versioned save, migrations, rotating backups, mastery, quiz scoring
    validate.js          content linter (schemas + cross-reference checks)
  ui/                    rendering + input only
    app.js               navigation, autosave, settings, dialogue, tutorials, lifecycle
    screens/*.js         one file per screen
  styles.css             design system (tokens, colour-blind palette, dyslexia font)
tools/                   build, linter, level solver, colony balance report, e2e playthrough
tests/                   node:test suites
android/                 Capacitor Android project
docs/                    plan, design decisions, science notes, privacy, playtest kit, summary
```

## Adding content without touching code

**A new flight level.** Add an object to `content/flight_levels.json` and put its `id` in that world's `levels` list in `worlds.json`. Then run `npm run lint` and `npm run solve` (the solver proves the level can be beaten).

```jsonc
{
  "id": "veil-3", "world": "veil", "title": "…", "brief": "…",
  "bounds": { "w": 600, "h": 1000 },                       // world units (portrait)
  "bodies": [
    { "id": "veil", "type": "planet", "mass": 80000, "radius": 50, "x": 300, "y": 500, "color": "#d6c75a" },
    { "id": "m", "type": "moon", "mass": 3000, "radius": 12, "color": "#999", "orbit": { "parent": "veil", "radius": 200, "phaseDeg": 0 } }
  ],                                                        // orbit periods are derived from gravity automatically
  "ship": { "x": 300, "y": 900 },                           // or { "orbit": { "body": "veil", "radius": 95 } }
  "objective": { "type": "orbit", "target": "veil", "rMin": 120, "rMax": 200, "hold": 6 },
  "fuel": 40, "maxDvPerBurn": 30, "maxBurns": 2, "maxTime": 60, "timeScale": 1.4,
  "hazards": { "debris": [], "gusts": [], "flares": [] },
  "goals": { "fuelLeftPct": 40, "hull": 100, "time": 30 },
  "hints": ["…", "…"], "concepts": ["orbits-falling"], "fact": "f-orbit-falling"
}
```

The objective types are `land`, `slingshot`, `orbit`, `hohmann`, `aerobrake`, `lagrange`, `rendezvous` and `escape`. `docs/DESIGN.md` explains each one.

**A new world.** Copy `content/_template_world/` and follow its README. You add one entry each to `worlds.json`, `investigations.json`, `colony.json` (`worlds`), `report.json`, `forge.json` (`worlds`), `quizzes.json` and `dialogue.json` (`worlds`), then set `"status": "playable"`. The linter tells you exactly what's missing.

**Clues.** Each clue has `weights` per hypothesis (`impact`, `greenhouse`, `stellar`, `volcanism`), from −3 to +3. Mark red herrings with `"redHerring": true`. A test checks that the correct answer is the best-supported one overall.

**Translations.** UI strings go in `content/lang/<lang>.json` under `"ui"`. Content is translated by id under `"content"`, e.g. `"cinder-1.title": "…"` or `"p1.t": "…"` for dialogue line `p1`. Anything missing falls back to English. To add a language, add a new file and import it in `src/content.js` and `tools/load_content.mjs`.

## Testing

| Command | What it checks |
|---|---|
| `npm test` | Physics (energy drift < 1% over 10 orbits, preview = live sim, inverse-square), fuel, star rating, colony rules + chain explanations, hypothesis scoring, star science, Moon phase, transit curves, saves (backups, migration v1→v2, blocked storage), content lint, every i18n key present, colony balance, **every flight level solvable** |
| `npm run solve` | Level solver report: how many launch solutions each level has (a difficulty indicator) |
| `npm run balance` | Colony balance report per world, with and without the wrong-hypothesis penalty |
| `npm run e2e` | Full 3-world playthrough in headless Chromium at phone size: real taps and drags, ~90 screenshots in `e2e-shots/`, fails on any console error. Needs a local Chromium; set the path in `tools/e2e.mjs` |

**About emulator testing:** the build environment couldn't download the Android SDK, so automated testing used the spec's fallback: a headless browser playthrough at phone resolution (390×844 @2x) plus golden screenshots. Before release, please also run the APK on a real mid-range phone or emulator (see the release checklist).

## Debug menu

Settings › tap the version number 5 times. From there you can unlock all worlds, skip a phase, reset tutorials, reset progress, and view content errors and the error log.

## Release checklist

- [ ] Run on a real mid-range Android phone (4 GB) and a 3 GB budget phone: 60 fps flight, launch < 3 s
- [ ] Replace the placeholder app icon and splash (Android Studio › New › Image Asset)
- [ ] Replace Real Space gallery placeholders with licensed images (see `assets/LICENSES.md`)
- [ ] Check every source link marked ⚠ in `docs/SCIENCE_NOTES.md`
- [ ] Have a native speaker review the Hindi and Tamil translations (partial in v1)
- [ ] Publish the privacy policy (`docs/PRIVACY_POLICY.md`) and fill in the Play Data Safety form as shown there
- [ ] Target audience in Play Console includes under-13s, so check the Families policy items in `docs/PRIVACY_POLICY.md`
- [ ] Playtest with 3–5 kids per age band (`docs/PLAYTEST_KIT.md`)

## Why HTML5 + Capacitor and not Flutter?

The original spec asked for Flutter + Flame. The build environment couldn't download the Flutter SDK, pub.dev packages or the Android SDK. A Flutter project written there could never have been compiled or tested, and you would have been handed unverified code. So the game is built with web technology, where every system could be tested and the whole game played through automatically, and it's wrapped as a native Android app with Capacitor. The architecture mirrors the spec (pure logic core, data-driven JSON content, screens as thin views), so a later Flutter port can reuse all the JSON content as-is and translate `src/core/` file by file. Its unit tests then serve as the specification. See `docs/DECISIONS.md`.
