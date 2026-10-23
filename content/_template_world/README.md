# New world template

1. Pick an id (lowercase, e.g. `tides`). The 5 teaser worlds already exist in `worlds.json`: flip one from `"comingSoon"` to `"playable"`, or add a new one.
2. Copy each block from `template.json` into the matching content file under your world id:
   - `world` → `worlds.json` (array; set `status: "playable"`, `levels`, `distanceLy`, `objectives`)
   - `flightLevels` → append to `flight_levels.json`
   - `investigation` → `investigations.json` (key = world id)
   - `colony` → `colony.json › worlds` (array)
   - `report` → `report.json` (key = world id) **and** `report.json › planetHunter` (key = world id)
   - `forge` → `forge.json › worlds` (key = world id)
   - `quiz` → `quizzes.json` (key = world id)
   - `dialogue` → `dialogue.json › worlds` (key = world id), and add the fragment to `dialogue.json › fragments`
3. Run `npm run lint`. It lists anything missing or misspelled, with file and field.
4. Run `npm run solve` (are your flight levels winnable?) and `npm run balance` (add a layout for your world in `tools/balance_colony.mjs`).
5. Add any new facts to `science_notes.json`, with a source and a `simplification`.
6. `npm test && npm run build`. Done, and no code changes needed.
