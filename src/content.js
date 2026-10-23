/**
 * Content bundle. Every gameplay value comes from these JSON files; the code
 * only interprets them. Add a level/world by editing JSON (see README).
 */
import worlds from '../content/worlds.json';
import flight from '../content/flight_levels.json';
import investigations from '../content/investigations.json';
import colony from '../content/colony.json';
import quizzes from '../content/quizzes.json';
import report from '../content/report.json';
import forge from '../content/forge.json';
import dialogue from '../content/dialogue.json';
import science from '../content/science_notes.json';
import extras from '../content/extras.json';
import en from '../content/lang/en.json';
import hi from '../content/lang/hi.json';
import ta from '../content/lang/ta.json';

export const content = { worlds, flight, investigations, colony, quizzes, report, forge, dialogue, science, extras, lang: { en, hi, ta } };
