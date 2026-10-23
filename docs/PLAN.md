# ECHO DRIFT: Plan

## Architecture

```
content/*.json ──► src/content.js ──► App shell (ui/app.js)
                                     ├── screens/*.js (render + input only)
                                     └── core/*.js (pure rules, no DOM)  ◄── tests/*.test.js, tools/*.mjs
save: core/save.js (versioned, 2 backups) ◄── localStorage (try/catch, memory fallback)
build: tools/build.mjs → dist/index.html (single offline file) → www/ → Capacitor android/
```

- **Pure core / thin UI.** Every rule (gravity, fuel, colony, scoring, stars) lives in `src/core`, has no DOM access, and is unit-tested. The tools (solver, balance report) reuse the exact same code.
- **Data-driven.** Levels, clues, colony rules, dialogue, quizzes and facts are all JSON. A schema linter runs before every build.
- **Offline and child-safe by design.** No network calls, fonts are inlined, and external links sit behind a parental gate.

## Milestones (all delivered in v1)

| # | Scope | Status |
|---|---|---|
| M1 | Setup, navigation, design system, JSON loading + linter, versioned save, tests, i18n, debug menu | ✅ |
| M2 | FLY: gravity engine, drag-to-launch, preview, fuel/hull, 8 levels across 3 worlds, 8 objective types, stars, particles, haptics, crash/retry, hints, ghost replay | ✅ |
| M3 | INVESTIGATE: 5 tools, charges, clue cards, Case Board (drag + tap), scoring, rock layers, glyphs, 3 worlds of content | ✅ |
| M4 | BUILD: resource sim, placement, events, win/lose with cause chain, pause/speed, balance pass | ✅ |
| M5 | DECODE (Light Ruler, queued messages + time skip, now-vs-then, crew signal puzzle + sonification, Planet Hunter) and FORGE (mass dial, ingredients, iron fizzle, life-cycle time-lapse, Goldilocks) | ✅ |
| M6 | Dialogue system, Galaxy Map, Logbook, Debrief quizzes, World 3, procedural audio, accessibility, settings, Sandbox, Look Up Tonight | ✅ |
| M7 | Hardening: e2e playthrough, error/empty states, Parent/Teacher screen, Android project, docs | ✅ (APK/AAB compiled on your PC, see README) |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Flutter/Android SDK unavailable in the build environment | Built as HTML5 + Capacitor and fully tested in a headless browser. The Android project is generated and ready for Android Studio. |
| Levels impossible or trivial | An automatic solver proves solvability and counts solutions. A coast-only check catches trivial levels. |
| Colony too easy or too hard | A balance test requires a lean base to win (with the penalty) and requires every life-support module to matter. |
| False science | Every fact has a source and a `simplification` note, and a teacher-readable export. Unverified links are flagged. |
| Performance on budget phones | Fixed-step physics, pooled particles, a Battery saver mode (fewer stars, 1× DPR, no parallax). |
| Lost progress | Autosave after every phase, two rotating backups, migrations, a pause on app hide. |
