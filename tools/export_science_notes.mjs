// Writes docs/SCIENCE_NOTES.md from content/science_notes.json (human-readable, for teachers).
import { writeFileSync } from 'node:fs';
import { loadContent } from './load_content.mjs';
const { science } = loadContent();
let md = '# ECHO DRIFT: Science Notes\n\nEvery fact the game states, with its source and what was simplified.\n\n> Links marked ⚠ could not be opened from the build environment. Please check them before release.\n\n';
for (const f of science.facts) md += `## ${f.title}\n\n${f.text}\n\n- **Simplified:** ${f.simplification}\n- **Source:** [${f.source.title}](${f.source.url})${f.source.verified ? '' : ' ⚠ verify'}\n- **Concepts:** ${f.concepts.join(', ') || '—'}\n\n`;
writeFileSync(new URL('../docs/SCIENCE_NOTES.md', import.meta.url), md);
console.log('✓ docs/SCIENCE_NOTES.md');
