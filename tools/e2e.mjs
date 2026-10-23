/**
 * End-to-end test in headless Chromium at phone size: opens every screen, flies
 * every mission through the real UI with Mission Assist, completes every lab,
 * saves screenshots and fails on any console/page error.
 * Usage: node tools/e2e.mjs [outDir]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const OUT = process.argv[2] || 'e2e-shots';
const ONLY = process.argv[3];
mkdirSync(OUT, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const log = (...a) => console.log('•', ...a);
await page.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await page.waitForSelector('[data-testid=mission-chandrayaan3]');
await wait(500);
await shot('home');
await page.evaluate(() => window.scrollTo(0, 2000));

const result = {};
async function closeToasts() {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
}
async function modalText() {
  await page.waitForSelector('.overlay .modal', { timeout: 600000 });
  return page.innerText('.overlay .modal');
}

/** Fly an orbital mission: press Mission Assist whenever a stage needs it, warp time, until it ends. */
async function flyOrbital(id, maxLoops = 60) {
  await page.waitForSelector('[data-testid=assist]');
  await wait(400);
  await closeToasts();
  await shot(id + '-start');
  for (let k = 0; k < maxLoops; k++) {
    if (await page.$('.overlay .modal')) break;
    const st = await page.evaluate(() => {
      const s = window.__LW.current;
      const cur = s.mission.stages.find((x) => !s.done.has(x.id) && !x.bonus) || s.mission.stages.find((x) => !s.done.has(x.id));
      return { stage: cur?.id, nodes: s.sim.nodes.length, t: s.sim.t, status: s.sim.status };
    });
    if (process.env.E2E_DEBUG) console.log('  ', k, JSON.stringify(st), await page.evaluate(() => { const s = window.__LW.current; return { paused: s.paused, warp: s.warpIndex, date: s.sim.date(s.sim.t).toISOString() }; }).catch(() => ''));
    if (!st.nodes && st.stage) {
      await page.click('[data-testid=assist]');
      await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 120000 });
      await wait(150);
      if (k === 0) await shot(id + '-assist');
      await closeToasts();
    }
    // play at high warp for a while
    await page.evaluate(() => {
      const s = window.__LW.current;
      s.setWarpIndex(s.sim.central === 'sun' ? 7 : 5);
      s.setPaused(false);
    });
    await wait(id === 'aditya' || id === 'voyager2' ? 2500 : 1600);
    if (k === 2) await shot(id + '-flying');
  }
  const txt = await modalText();
  result[id] = txt.split('\n')[0];
  log(id, '→', txt.split('\n').slice(0, 2).join(' | '));
  await shot(id + '-result');
  // continue for bonus if offered, else go home
  const btns = await page.$$('.overlay .modal button');
  const labels = await Promise.all(btns.map((b) => b.innerText()));
  if (labels.some((l) => /Keep flying/.test(l))) {
    await page.click('[data-testid=modal-go]');
    await flyOrbital(id, 30);
    return;
  }
  await page.click('[data-testid=modal-home]');
  await page.waitForSelector('[data-testid=mission-chandrayaan3]');
}

async function openMission(id) {
  await page.click(`[data-testid=mission-${id}]`);
  await page.waitForSelector('[data-testid=start]');
  await shot(id + '-briefing');
  await page.click('[data-testid=start]');
}

const orbital = ['chandrayaan3', 'apollo13', 'voyager2', 'aditya', 'mangalyaan'];
for (const id of orbital) {
  if (ONLY && ONLY !== id) continue;
  await openMission(id);
  if (id === 'mangalyaan') {
    await page.waitForSelector('[data-testid=launch]:not([disabled])', { timeout: 120000 });
    await wait(300);
    await shot('mangalyaan-porkchop');
    await page.click('[data-testid=launch]');
  }
  await flyOrbital(id);
}

/* ---------- landers ---------- */
async function land(id) {
  await openMission(id);
  await page.waitForSelector('[data-testid=autoland]');
  await wait(1500);
  await shot(id + '-descent');
  await page.click('[data-testid=autoland]');
  await wait(3000);
  await shot(id + '-assist');
  const txt = await modalText();
  result[id] = txt.split('\n')[0];
  log(id, '→', txt.split('\n').slice(0, 3).join(' | '));
  await shot(id + '-result');
  await page.click('[data-testid=modal-home]');
  await page.waitForSelector('[data-testid=mission-chandrayaan3]');
}
if (!ONLY || ONLY === 'apollo11') await land('apollo11');
if (!ONLY || ONLY === 'vikram') await land('vikram');

/* ---------- Perseverance ---------- */
if (!ONLY || ONLY === 'perseverance') {
  await openMission('perseverance');
  await page.waitForSelector('[data-testid=guided]');
  await wait(800);
  await shot('perseverance-entry');
  await page.click('[data-testid=guided]');
  await page.evaluate(() => window.__LW.current.setSpeed(10));
  await page.waitForFunction(() => window.__LW.current.entry?.phase === 'chute', null, { timeout: 120000 });
  await shot('perseverance-chute');
  await page.waitForSelector('[data-testid=autoland]', { timeout: 120000 });
  await wait(800);
  await shot('perseverance-skycrane');
  await page.click('[data-testid=autoland]');
  const txt = await modalText();
  result.perseverance = txt.split('\n')[0];
  log('perseverance →', txt.split('\n').slice(0, 3).join(' | '));
  await shot('perseverance-result');
  await page.click('[data-testid=modal-home]');
  await page.waitForSelector('[data-testid=mission-chandrayaan3]');
}

/* ---------- labs ---------- */
async function lab(id, solve) {
  await page.click(`[data-testid=lab-${id}]`);
  await wait(500);
  await shot('lab-' + id);
  await solve();
  await wait(300);
  await shot('lab-' + id + '-solved');
  const fin = await page.$('text=Finish lab');
  result['lab-' + id] = fin ? 'solved' : 'NOT solved';
  log('lab', id, fin ? 'solved' : 'NOT solved');
  if (fin) {
    await fin.click();
    await page.click('.overlay .modal button');
  } else await page.click('button[aria-label=Back]');
  await page.waitForSelector('[data-testid=mission-chandrayaan3]');
}
if (!ONLY || ONLY === 'labs') {
  await lab('galileo', async () => {
    const times = [40, 82.5]; // two neighbouring eastern elongations of Io (precomputed from the ephemeris)
    for (const t of times) {
      await page.$eval('input[type=range]', (el, v) => ((el.value = v), el.oninput()), t);
      await page.click('[data-testid=mark]');
    }
  });
  await lab('exoplanet', async () => {
    for (const [k, v] of [['P', 4.2308], ['K', 55.8], ['ph', 0.37]]) await page.$eval(`[data-testid=fit-${k}]`, (el, val) => ((el.value = val), el.oninput()), v);
  });
  await lab('gw', async () => {
    await page.$eval('[data-testid=mc]', (el) => ((el.value = 28.1), el.oninput()));
  });
  await lab('blackhole', async () => {
    for (let i = 0; i < 18; i++) await page.click('text=◀ left');
    for (let i = 0; i < 18; i++) await page.click('text=right ▶');
  });
}

/* ---------- explorer & about ---------- */
if (!ONLY) {
  await page.click('text=Solar System now');
  await wait(600);
  await shot('explorer');
  await page.click('text=When is the next Mars launch window?');
  await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 60000 });
  await wait(200);
  await shot('explorer-window');
  log('next Mars window:', (await page.innerText('.screen')).match(/Next cheapest[^\n]*/)?.[0]);
  await page.click('button[aria-label=Back]');
  await page.click('text=How the physics works');
  await wait(300);
  await shot('about');
  await page.click('button[aria-label=Back]');
  await wait(300);
  await shot('home-after');
}

await browser.close();
console.log('\nRESULTS', JSON.stringify(result, null, 1));
console.log(`Screenshots: ${n} in ${OUT}`);
if (errors.length) {
  console.log(`✗ ${errors.length} error(s):\n` + [...new Set(errors)].slice(0, 20).join('\n'));
  process.exitCode = 1;
} else console.log('✓ No console or page errors');
