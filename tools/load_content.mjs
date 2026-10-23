// Node-side loader for the same content bundle (used by tests and tools).
import { readFileSync } from 'node:fs';
const read = (f) => JSON.parse(readFileSync(new URL(`../content/${f}`, import.meta.url), 'utf8'));
export function loadContent() {
  return {
    worlds: read('worlds.json'), flight: read('flight_levels.json'), investigations: read('investigations.json'),
    colony: read('colony.json'), quizzes: read('quizzes.json'), report: read('report.json'), forge: read('forge.json'),
    dialogue: read('dialogue.json'), science: read('science_notes.json'), extras: read('extras.json'),
    lang: { en: read('lang/en.json'), hi: read('lang/hi.json'), ta: read('lang/ta.json') },
  };
}
