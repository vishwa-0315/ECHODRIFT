# Asset licences

| Asset | Source | Licence | Notes |
|---|---|---|---|
| Atkinson Hyperlegible font | Braille Institute, via @fontsource/atkinson-hyperlegible | SIL Open Font License 1.1 | Bundled (inlined) in the build |
| OpenDyslexic font | Abbie Gonzalez, via @fontsource/opendyslexic | SIL Open Font License 1.1 | Optional dyslexia-friendly font |
| All sound effects and music | Generated at runtime (Web Audio synthesis, `src/ui/audio.js`) | Original, no third-party audio | Nothing to license |
| Crew portraits, planets, scenes, glyphs, icons | Generated in code (`src/ui/art.js`) | Original | Placeholders, easy to swap (see `assets/manifest.json`) |
| Emoji icons | System emoji font of the device | Platform-provided | Consider replacing with an icon set for a consistent look |
| Real Space gallery | **Placeholder gradients** | — | **TODO:** replace each entry using `extras.json › gallery[].todo`. NASA images are generally public domain; ESA, ESO and EHT images are usually CC BY 4.0 (credit required). Record each final image here. Never hotlink. |
| App icon / splash | Capacitor defaults | — | **TODO:** replace in Android Studio (New › Image Asset) |
