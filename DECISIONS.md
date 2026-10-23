# Decisions log

- **HTML5 + Capacitor instead of Flutter.** The build environment blocks the Flutter SDK, pub.dev and the Android SDK. Untestable Flutter code would have shipped with unknown errors. Web tech allowed full automated testing; Capacitor 8 produces a native Android app (min SDK 24). The JSON content and the `src/core` logic + tests are a ready spec for a future Flutter port.
- **Custom n-body integrator, not a physics library.** A physics library is rigid-body only and has no n-body gravity. Velocity-Verlet at a fixed 1/120 s step is deterministic, energy-stable, and lets the preview reuse the sim.
- **Kinematic orbits for moons/planets** with periods derived from gravity: deterministic levels, physically consistent motion, and easy authoring.
- **Fuel ∝ Δv**, as in real rocketry. It makes gravity assists and two-burn transfers measurably efficient.
- **Flares disable sensors; CMEs push.** This replaces v1's "flares push the ship", which isn't accurate.
- **Star fate by mass; ingredients are flavour.** Iron fizzles the furnace (fusing iron consumes energy).
- **Time freezes while aiming.** Turn-based aiming is fairer on small touch screens, and the preview is still limited (2–3 s) to keep it a skill.
- **Drag anywhere to aim,** not only from the ship. This is easier for small hands; the arrow is still drawn from the ship.
- **No storage packages.** `localStorage` with try/catch, an in-memory fallback, versioned saves and 2 backups. Nothing unmaintained is used.
- **Procedural audio and art.** No asset licensing risk, a tiny download (580 KB total), easy to swap later.
- **Atkinson Hyperlegible default font, OpenDyslexic option,** both OFL and inlined so the game works offline.
- **Colony base power storage = 20.** This makes night-time planning matter; batteries help but aren't mandatory.
- **Starting colony stocks 28/28/24.** At 45, food lasted the whole mission without a greenhouse, so the module didn't matter.
- **The Planet Hunter snaps taps to the nearest real dip** and offers an accessible list. Exact tapping on a phone was too fiddly.
- **The Case Board stacks clues in a horizontal strip** above the hypotheses. Two columns were unreadable at 390 px.
- **Capacitor App plugin for the hardware back button.** It closes to the map, never mid-modal.
