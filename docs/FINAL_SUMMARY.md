# Final summary

## Done (v1)

- **The full game loop on 3 worlds:** FLY → LAND → INVESTIGATE → BUILD → REPORT → FORGE → DEBRIEF, with autosave after every phase and resume after a restart.
- **FLY:**
  - 8 levels covering 8 objective types: land, slingshot, orbit, two-burn transfer, aerobrake, Lagrange point, rendezvous and escape.
  - Hazards: debris, CME gusts, sensor-killing flares and a black hole.
  - Stars, hints after fails, a slow-motion crash, a crew quip and one-tap retry.
  - Ghost replay, a 1×/2× speed button and the full-preview unlock.
- **INVESTIGATE:**
  - 5 scanner tools with limited charges, and 22 clues including red herrings.
  - Case Board (drag or tap), evidence strength, the honest "Unknown" choice, and a consequence carried into BUILD.
  - Rock-layer superposition puzzle and Orrin prime/binary glyphs.
- **BUILD:**
  - 8 module types, power priority and day/night.
  - World events: dust and acid storms, a heatwave, radiation flares.
  - Pause and 2× speed, plus a cause → effect failure chain.
- **REPORT:**
  - Light Ruler and a 76-year message delay shown with a time-skip.
  - "Now vs. as seen from Earth".
  - Crew signal puzzle with sonification (you can hear the pattern).
  - Planet Hunter, which teaches the transit method.
- **FORGE:**
  - A mass dial decides the star's fate, iron fizzles the furnace, and a life-cycle time-lapse plays.
  - Goldilocks step: the habitable zone visibly moves outward.
- **Story:** prologue, intro and after-phase scenes, the Orrin fragments, and a reassuring timescale on the Sun reveal.
- **Other screens:**
  - Galaxy Map, Look Up Tonight (real Moon phase, offline), Logbook (fragments, sourced facts, clue archive, gallery, badges).
  - Sandbox, Settings, and the Parent/Teacher report behind a gate (print to PDF).
- **Accessibility:**
  - Colour-blind palette, 4 text sizes, reduce motion, dyslexia font and screen-reader labels.
  - A non-drag Case Board, an accessible dip list, and 48 px touch targets.
- **Languages:** English, plus partial Hindi and Tamil with English fallback.
- **Child-safe:** offline, no data collected, no ads or purchases, links behind a parental gate.
- **Quality:**
  - 35 automated tests, a content linter, a level solver and a colony balance test.
  - A full 3-world e2e playthrough with 0 console errors, at 60 fps in a headless browser.
- **Android:** a Capacitor 8 project (min SDK 24, target SDK 36) with back-button handling.

## Stubbed / placeholder

- Worlds 4–8: map teasers with planned learning objectives only.
- Real Space gallery: placeholder gradients (TODO notes give the exact images to license).
- App icon and splash: Capacitor defaults.
- Hindi and Tamil: core UI + World 1 story only; the rest falls back to English.
- Art: generated vector placeholders, listed in `assets/manifest.json`.

## Not verified here (needs your machine)

- Compiling the APK/AAB: Gradle and the Android SDK were blocked in the build environment.
- Performance on a real 3–4 GB phone.
- About 20 science source links (flagged ⚠ in `docs/SCIENCE_NOTES.md`).

## Recommended next steps

1. Build the APK in Android Studio and play World 1 on a real phone.
2. Playtest with kids using `docs/PLAYTEST_KIT.md`.
3. Commission or source real art for the crew portraits and gallery.
4. Build World 4 "Tides" from `content/_template_world/`.
5. Finish the Hindi and Tamil translations with native-speaker review.
6. Stretch goal: local co-op Mission Control mode.
