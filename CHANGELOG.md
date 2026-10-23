# Changelog

## 1.0.0
- First complete vertical slice: 3 playable worlds (Cinder, Veil, Hollow) and 5 teaser worlds.
- FLY with 8 levels and 8 objective types; INVESTIGATE with Case Board, rock layers and glyphs; BUILD colony sim; REPORT (Light Ruler, delayed messages, signal decoding, Planet Hunter); FORGE (star life cycle + Goldilocks zone); Mission Debrief.
- Logbook, Galaxy Map with Look Up Tonight, Sandbox, Settings (accessibility), Parent/Teacher report.
- English, plus partial Hindi and Tamil.
- Android project (Capacitor 8).

### Fixed during verification
- A pulsing scan spot drifted sideways because its animation overrode the centring transform.
- Planet Hunter answer buttons rendered as text ("[object HTMLButtonElement]").
- A stray "null" appeared on colony, forge, settings and debrief screens (native `append`).
- A forced success/failure event could be missed if it arrived while not flying.
- The content linter looked for forge entries in the wrong place.
- Case Board columns were too cramped on phones; the colony grid was oversized; map labels overlapped; parent-report evidence repeated.
- Balance: food lasted without a greenhouse, and batteries were pointless.
- Facts corrected: a "solar flares push the ship" mechanic, a "Sun 30% brighter" line, and an April sky tip for Indian latitudes.
