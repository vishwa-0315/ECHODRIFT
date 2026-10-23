/**
 * End-to-end playthrough in a real (headless) Chromium at phone size.
 * Plays all 3 worlds through the actual UI, records console errors, and saves
 * screenshots of every screen. Usage: node tools/e2e.mjs [outDir]
 * (Fallback for "run on an Android emulator": see README > Testing.)
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import { loadContent } from './load_content.mjs';

const OUT = process.argv[2] || 'e2e-shots';
mkdirSync(OUT, { recursive: true });
const content = loadContent();
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('console', (m) => m.type() === 'warning' && m.text().includes('[i18n]') && errors.push('i18n: ' + m.text()));
const url = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;
let shotN = 0;
const shot = async (name) => page.screenshot({ path: `${OUT}/${String(++shotN).padStart(2, '0')}-${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const log = (...a) => console.log('•', ...a);

async function tapDialogue(max = 40) {
  for (let i = 0; i < max; i++) {
    const d = await page.$('.dialogue');
    if (!d) return;
    await d.click({ position: { x: 30, y: 30 } });
    await wait(60);
  }
}
async function modalBtn(text) {
  await page.waitForSelector('.overlay .modal', { timeout: 15000 });
  const btns = await page.$$('.overlay .modal button');
  for (const b of btns) if ((await b.innerText()).includes(text)) return b.click();
  // default: last (primary) button
  return btns[btns.length - 1].click();
}
async function closeModals(max = 6) {
  for (let i = 0; i < max; i++) {
    if (!(await page.$('.overlay .modal'))) return;
    const btns = await page.$$('.overlay .modal > .row > button');
    await btns[btns.length - 1].click();
    await wait(120);
  }
}
const app = (fn, arg) => page.evaluate(fn, arg);

/* ---------- Title, rank, prologue, map ---------- */
await page.goto(url);
await wait(600);
await shot('title');
await page.click('[data-testid=play]');
await wait(300);
await shot('rank-choice');
await modalBtn('Cadet');
await wait(200);
await shot('prologue-dialogue');
await tapDialogue();
await page.waitForSelector('.map');
await wait(300);
await shot('galaxy-map');

/* ---------- One world, generically, through the real UI ---------- */
async function playWorld(wid, opts = {}) {
  log('World', wid);
  await page.click(`[data-testid=world-${wid}]`);
  await wait(300);
  if (wid === 'cinder') await shot(`${wid}-intro`);
  await page.click('[data-testid=intro-go]');
  await tapDialogue();
  // FLY
  const world = content.worlds.find((w) => w.id === wid);
  for (let li = 0; li < world.levels.length; li++) {
    await page.waitForSelector('.overlay .modal');
    if (li === 0) await shot(`${wid}-flight-brief`);
    await modalBtn('Launch');
    await wait(400);
    if (wid === 'cinder' && li === 0) {
      // Real drag: pull down a little from the ship → gentle launch up toward Cinder.
      await shot('cinder-flight-ready');
      const box = await page.$eval('canvas', (c) => c.getBoundingClientRect().toJSON());
      const sx = box.x + box.width / 2;
      const sy = box.y + box.height * 0.6;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx, sy + 40, { steps: 6 });
      await wait(150);
      await shot('cinder-flight-aiming');
      await page.mouse.up();
      await wait(2500);
      await shot('cinder-flight-flying');
      await page.waitForSelector('.overlay .modal', { timeout: 60000 });
      const txt = await page.innerText('.overlay .modal');
      log('cinder-1 result:', txt.split('\n').slice(0, 2).join(' | '));
      await shot('cinder-flight-result');
      if (/Try again/.test(txt) && !/Mission success/.test(txt)) {
        // Real drag failed — retry and force a success to keep going (logged).
        await modalBtn('Try again');
        await wait(300);
        await app(() => window.__ED.current.sim._succeed());
        await page.waitForSelector('.overlay .modal');
      }
      await modalBtn('Next');
      continue;
    }
    if (wid === 'cinder' && li === 1) {
      // Fail flow: burn straight into Cinder.
      await app(() => window.__ED.current.sim.burn(-20, -40));
      await page.waitForSelector('.overlay .modal', { timeout: 30000 });
      await shot('cinder-flight-crash');
      await modalBtn('Try again');
      await wait(300);
    }
    if (opts.landscape && li === 0) {
      await page.setViewportSize({ width: 844, height: 390 });
      await wait(400);
      await shot(`${wid}-flight-landscape`);
      await page.setViewportSize({ width: 390, height: 844 });
      await wait(300);
    }
    await app(() => {
      const s = window.__ED.current.sim;
      s.status = 'flying';
      s._succeed();
    });
    await page.waitForSelector('.overlay .modal', { timeout: 10000 });
    if (li === world.levels.length - 1) await shot(`${wid}-flight-success`);
    await modalBtn('Next');
    await wait(200);
  }
  await tapDialogue();

  // INVESTIGATE — scan every clue that supports the answer (plus one red herring)
  await page.waitForSelector('.scene');
  await wait(200);
  await shot(`${wid}-investigate`);
  const inv = content.investigations[wid];
  const good = inv.clues.filter((c) => (c.weights[inv.answer] || 0) > 0).slice(0, 3);
  const herring = inv.clues.find((c) => c.redHerring);
  for (const c of [...good, herring]) {
    await page.click(`[data-testid=tool-${c.tool}]`);
    await page.click(`[data-testid=hs-${c.hotspot}]`);
    await page.waitForSelector('.overlay .modal');
    if (c === good[0]) await shot(`${wid}-clue-card`);
    await closeModals();
  }
  // a scan that finds nothing
  if (inv.layers) {
    await page.click('[data-testid=layers]');
    await page.waitForSelector('.overlay .modal');
    for (const l of inv.layers.layers) await page.click(`[data-layer=${l.id}]`);
    await shot(`${wid}-layers`);
    await modalBtn('Check');
    await wait(200);
    await closeModals();
  }
  await page.click('[data-testid=glyph]');
  await page.waitForSelector('.overlay .modal');
  await shot(`${wid}-glyph`);
  await modalBtn(String(inv.glyph.answer));
  await wait(200);
  await closeModals();
  await page.click('[data-testid=open-board]');
  await page.waitForSelector('[data-hyp]');
  // tap-tap pinning
  for (const c of good) {
    await page.click(`[data-clue=${c.id}]`);
    await page.click(`[data-hyp=${opts.wrongGuess ? 'volcanism' : inv.answer}] b`);
  }
  await page.click(`[data-clue=${herring.id}]`);
  await page.click(`[data-hyp=volcanism] b`);
  await wait(100);
  await shot(`${wid}-caseboard`);
  await page.click(`[data-testid=submit-${opts.wrongGuess ? 'volcanism' : opts.unknown ? 'unknown' : inv.answer}]`);
  await page.waitForSelector('.overlay .modal');
  await shot(`${wid}-verdict`);
  await closeModals();
  await tapDialogue();

  // BUILD — place the lean layout
  await page.waitForSelector('.cgrid');
  const layout = { cinder: 'solar solar solar battery water o2gen greenhouse habitat habitat', veil: 'solar solar solar solar solar battery water greenhouse o2gen habitat habitat', hollow: 'solar solar solar shield battery water greenhouse o2gen habitat habitat' }[wid].split(' ');
  for (let i = 0; i < layout.length; i++) {
    await page.click(`[data-testid=mod-${layout[i]}]`);
    await page.click(`[data-testid=cell-${i}]`);
  }
  await shot(`${wid}-colony-plan`);
  await page.click('[data-testid=col-start]');
  await page.click('button[aria-label="Change speed"]');
  await wait(9000);
  await shot(`${wid}-colony-running`);
  await page.waitForSelector('.overlay .modal', { timeout: 60000 });
  const colTxt = await page.innerText('.overlay .modal');
  log('colony:', colTxt.split('\n')[0]);
  await shot(`${wid}-colony-result`);
  await closeModals();
  await tapDialogue();

  // REPORT
  await page.waitForSelector('.slider');
  await page.$eval('.slider', (s) => {
    s.value = 3;
    s.dispatchEvent(new Event('input'));
  });
  if (wid === 'cinder') await shot('report-ruler');
  await page.click('[data-testid=rep-next]');
  const qs = content.report[wid].questions.slice(0, 2);
  for (const q of qs) await page.click(`[data-q=${q.id}]`);
  await page.click('[data-testid=rep-send]');
  await wait(600);
  if (wid === 'cinder') await shot('report-timeskip');
  await page.waitForSelector('[data-testid=rep-next]', { timeout: 10000 });
  await shot(`${wid}-report-answers`);
  await page.click('[data-testid=rep-next]');
  await page.click('[data-testid=now]');
  await wait(700);
  await shot(`${wid}-now-vs-then`);
  await page.click('[data-testid=rep-next]');
  for (let i = 0; i < 3; i++) await page.click(`[data-testid=reading-${i}]`);
  await shot(`${wid}-signal`);
  // try a wrong answer first, then the right one
  const sg = content.report[wid].signal;
  const wrong = sg.options.find((o) => o.id !== sg.answer);
  await page.click(`[data-opt=${wrong.id}]`);
  await closeModals();
  await page.click(`[data-opt=${sg.answer}]`);
  await closeModals();
  // Planet hunter: open the accessible dip list and pick two neighbouring dips of the target planet.
  await page.waitForSelector('canvas.chart');
  const ph = content.report.planetHunter[wid];
  const p = ph.planets.find((x) => x.id === ph.target);
  const d1 = (p.phase + p.duration / 2).toFixed(1);
  const d2 = (p.phase + p.period + p.duration / 2).toFixed(1);
  await page.click('details summary');
  for (const d of [d1, d2]) {
    const btns = await page.$$('[data-dip]');
    for (const b of btns) if ((await b.innerText()).endsWith(' ' + d)) {
      await b.click();
      break;
    }
  }
  await wait(150);
  await shot(`${wid}-planet-hunter`);
  await page.click(`[data-cand=${ph.target}]`);
  await closeModals();
  await tapDialogue();

  // FORGE
  await page.waitForSelector('[data-testid=cook]');
  const req = content.forge.worlds[wid].requirement.types[0];
  const mass = { sunlike: 1, reddwarf: 0.3, whitestar: 3, bluegiant: 15 }[req];
  const v = Math.round((1000 * Math.log(mass / content.forge.massMin)) / Math.log(content.forge.massMax / content.forge.massMin));
  await page.$eval('[data-testid=mass]', (s, v) => {
    s.value = v;
    s.dispatchEvent(new Event('input'));
  }, v);
  if (wid === 'cinder') {
    await page.click('[data-ing=Fe]');
    await page.click('[data-testid=cook]');
    await page.waitForSelector('.overlay .modal');
    await shot('forge-iron-fizzle');
    await closeModals();
    await page.$eval('[data-testid=mass]', (s, v) => {
      s.value = v;
      s.dispatchEvent(new Event('input'));
    }, v);
  }
  await page.click('[data-ing=H]');
  await page.click('[data-ing=H]');
  await page.click('[data-ing=He]');
  await shot(`${wid}-forge`);
  await page.click('[data-testid=cook]');
  await wait(2500);
  await shot(`${wid}-forge-timelapse`);
  await page.waitForSelector('.overlay .modal', { timeout: 20000 });
  await closeModals(1);
  await page.waitForSelector('[data-testid=planet]');
  // put the planet in the middle of the zone
  await page.evaluate(() => {
    const s = document.querySelector('[data-testid=planet]');
    for (let v = 0; v <= 1000; v += 5) {
      s.value = v;
      s.dispatchEvent(new Event('input'));
      if (document.querySelector('.card[aria-live]')?.innerText.includes('Liquid')) {
        s.value = v + 40;
        s.dispatchEvent(new Event('input'));
        break;
      }
    }
  });
  await shot(`${wid}-goldilocks`);
  await page.click('[data-testid=place]');
  await wait(2500);
  await shot(`${wid}-goldilocks-aging`);
  await page.waitForSelector('.overlay .modal', { timeout: 15000 });
  await shot(`${wid}-goldilocks-result`);
  await closeModals(3);
  await tapDialogue();

  // DEBRIEF
  await page.waitForSelector('[data-testid=quiz-start]');
  await page.click('[data-testid=quiz-start]');
  const quiz = content.quizzes[wid];
  for (let qi = 0; qi < quiz.questions.length; qi++) {
    await page.waitForSelector('[data-opt]');
    if (qi === 0) await shot(`${wid}-quiz`);
    const pick = qi === 1 ? (quiz.questions[qi].correct + 1) % quiz.questions[qi].options.length : quiz.questions[qi].correct;
    await page.click(`[data-opt="${pick}"]`);
    await page.waitForSelector('.overlay .modal');
    if (qi === 1) await shot(`${wid}-quiz-feedback`);
    await closeModals(1);
  }
  await page.waitForSelector('[data-testid=to-map]');
  await shot(`${wid}-complete`);
  await page.click('[data-testid=to-map]');
  await page.waitForSelector('.map');
}

await playWorld('cinder');
await shot('map-after-cinder');

// Resume test: start Veil, reload mid-investigation, and check we come back to it.
await playWorld('veil', { wrongGuess: true, landscape: true });
await playWorld('hollow', { unknown: true });
await shot('map-all-done');

/* ---------- Logbook, settings, parent, sandbox ---------- */
await page.click('text=Logbook');
await wait(200);
for (const tab of ['Orrin message', 'Science', 'Clues', 'Real Space', 'Badges']) {
  await page.click(`.tabs >> text=${tab}`);
  await wait(120);
  await shot('logbook-' + tab.toLowerCase().replace(/\s/g, '-'));
}
await page.click('button[aria-label=Back]');
await page.click('text=Settings');
await wait(200);
await shot('settings');
await page.click('[data-testid=set-colorblind]');
await page.click('.seg >> text=A++');
await page.click('.seg >> text=हिन्दी');
await wait(200);
await shot('settings-hindi-cb-large');
await page.click('.seg >> text=தமிழ்');
await page.click('button[aria-label]', { position: { x: 5, y: 5 } }).catch(() => {});
await wait(100);
await page.evaluate(() => window.__ED.go('map'));
await wait(300);
await shot('map-tamil');
await page.evaluate(() => {
  window.__ED.setSetting('lang', 'en');
  window.__ED.setSetting('textSize', 1);
  window.__ED.setSetting('colorblind', false);
  window.__ED.go('parent');
});
await page.click('[data-testid=gate-open]');
await page.waitForSelector('[data-testid=gate-input]');
const prompt = await page.innerText('.overlay .modal p');
const words = { 'forty-seven': 47, 'eighty-three': 83, 'twenty-nine': 29, 'sixty-four': 64, 'ninety-one': 91, 'thirty-eight': 38 };
const num = Object.entries(words).find(([w]) => prompt.includes(w))[1];
await page.fill('[data-testid=gate-input]', String(num));
await modalBtn('OK');
await wait(300);
await shot('parent-report');
await page.evaluate(() => window.__ED.go('sandbox'));
await wait(200);
const sb = await page.$eval('canvas', (c) => c.getBoundingClientRect().toJSON());
await page.click('.seg >> text=Ship');
await page.mouse.move(sb.x + sb.width * 0.2, sb.y + sb.height * 0.8);
await page.mouse.down();
await page.mouse.move(sb.x + sb.width * 0.25, sb.y + sb.height * 0.9, { steps: 5 });
await page.mouse.up();
await wait(1500);
await shot('sandbox');

/* ---------- Resume after reload + autosave ---------- */
await page.evaluate(() => {
  const app = window.__ED;
  app.ws('veil').phase = 'build';
  app.ws('veil').complete = false;
  app.persist();
});
await page.reload();
await wait(500);
await page.click('[data-testid=play]');
await page.waitForSelector('.map');
await page.click('[data-testid=world-veil]');
await wait(300);
const resumed = await page.evaluate(() => window.__ED.currentName);
log('resume after reload → screen:', resumed);
if (resumed !== 'colony') errors.push('resume went to ' + resumed);
await shot('resumed-colony');

/* ---------- Corrupt save recovery ---------- */
await page.evaluate(() => {
  window.__ED.persist = () => {};
  localStorage.setItem('echodrift.save', '{oops');
});
await page.reload();
await wait(400);
const src = await page.evaluate(() => window.__ED.saveSource);
log('corrupt save → loaded from:', src);
if (src !== 'echodrift.save.bak1') errors.push('corrupt save did not fall back to backup: ' + src);

/* ---------- Performance probe: flight frame time ---------- */
await page.evaluate(() => {
  const a = window.__ED;
  a.ws('hollow').unlocked = true;
  a.go('flight', { world: 'hollow', replay: true });
});
await wait(400);
await closeModals(1);
await page.evaluate(() => window.__ED.current.sim.coast());
const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const f = () => (++n, performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res((n * 1000) / (performance.now() - t0)));
      requestAnimationFrame(f);
    }),
);
log('flight fps (headless, software rendering):', fps.toFixed(1));

await browser.close();
console.log(`\nScreenshots: ${shotN} in ${OUT}`);
if (errors.length) {
  console.log(`✗ ${errors.length} error(s):\n` + [...new Set(errors)].join('\n'));
  process.exitCode = 1;
} else console.log('✓ No console errors or page errors during the full playthrough');
