// Content linter: `npm run lint`. Exits non-zero with readable errors.
import { loadContent } from './load_content.mjs';
import { lintContent } from '../src/core/validate.js';
let content;
try { content = loadContent(); } catch (e) { console.error('Content JSON failed to parse:', e.message); process.exit(1); }
const errors = lintContent(content);
if (errors.length) { console.error(`✗ ${errors.length} content problem(s):\n  - ` + errors.join('\n  - ')); process.exit(1); }
console.log(`✓ Content OK: ${content.worlds.length} worlds, ${content.flight.length} flight levels, ${content.science.facts.length} science facts`);
