/**
 * Records a ~2-minute captioned gameplay demo at phone size (for the competition video).
 * Usage: node tools/demo.mjs outDir   → outDir/*.webm (convert to mp4 with ffmpeg)
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'demo-video';
mkdirSync(OUT, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, recordVideo: { dir: OUT, size: { width: 800, height: 1720 } } });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const caption = (text, sub = '') =>
  page.evaluate(
    ([t, s]) => {
      let c = document.getElementById('demo-cap');
      if (!c) {
        c = document.createElement('div');
        c.id = 'demo-cap';
        c.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:99999;pointer-events:none;background:rgba(4,6,11,0.88);border:1px solid #ff9933;border-radius:12px;padding:10px 14px;font:600 15px/1.3 Inter,system-ui,sans-serif;color:#fff;transition:opacity .3s';
        document.body.appendChild(c);
      }
      c.innerHTML = t ? `${t}${s ? `<div style="font-weight:400;font-size:12.5px;color:#c9d4e6;margin-top:3px">${s}</div>` : ''}` : '';
      c.style.opacity = t ? '1' : '0';
    },
    [text, sub],
  );
const clearToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
const noBusy = () => page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 120000 });
const home = async () => {
  if (await page.$('.overlay .modal [data-testid=modal-home]')) await page.click('[data-testid=modal-home]');
  await page.waitForSelector('[data-testid=mission-chandrayaan3]');
};

await page.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await page.waitForSelector('[data-testid=mission-chandrayaan3]');

/* 1. Title */
await caption('Launch Window', 'Fly the real missions of ISRO and NASA, with real physics. No made-up worlds.');
await wait(4000);
await caption('Planets at their real positions, right now', 'Positions computed from real ephemerides (VSOP87)');
await wait(2500);
for (let y = 0; y <= 900; y += 30) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await wait(45);
}
await caption('8 real missions + 4 discovery labs', 'ISRO: Chandrayaan-3, Vikram, Mangalyaan, Aditya-L1 · NASA: Apollo 11 & 13, Voyager 2, Perseverance');
await wait(3000);
await page.evaluate(() => window.scrollTo(0, 0));

/* 2. Chandrayaan-3 */
await page.click('[data-testid=mission-chandrayaan3]');
await page.waitForSelector('[data-testid=start]');
await caption('Every mission starts with the real story', 'Real dates, real spacecraft masses and engines, cited sources');
await wait(3500);
await page.click('[data-testid=start]');
await page.waitForSelector('[data-testid=assist]');
await wait(800);
await clearToasts();
await caption('Chandrayaan-3: Earth to the Moon', 'Newtonian gravity from Earth, Moon and Sun. Nothing is scripted.');
await wait(3000);
const st = () =>
  page.evaluate(() => {
    const s = window.__LW.current;
    const cur = s.mission.stages.find((x) => !s.done.has(x.id) && !x.bonus);
    return { stage: cur?.id, nodes: s.sim.nodes.length };
  });
const captions = {
  raise: ['Raise the orbit at perigee', 'Mission Assist plans the burn; the dashed line shows exactly what will happen'],
  tli: ['Trans-lunar injection', 'One burn at the right perigee sends the craft to the Moon'],
  loi: ['Lunar orbit insertion', 'Brake at perilune or fly past the Moon forever'],
};
let lastStage = '';
for (let k = 0; k < 120; k++) {
  if (await page.$('.overlay .modal')) break;
  const s = await st();
  if (!s.stage) break;
  if (s.stage !== lastStage && captions[s.stage]) {
    await caption(...captions[s.stage]);
    lastStage = s.stage;
  }
  if (!s.nodes) {
    await page.click('[data-testid=assist]');
    await noBusy();
    await wait(1600);
    await clearToasts();
  }
  await page.evaluate(() => {
    const s = window.__LW.current;
    s.setWarpIndex(6);
    s.setPaused(false);
  });
  await wait(1200);
}
await page.waitForSelector('.overlay .modal', { timeout: 300000 });
await caption('Captured by the Moon', 'Compared with what ISRO really did on 5 August 2023');
await wait(2500);
if (await page.$('[data-testid=modal-finish]')) {
  await page.click('[data-testid=modal-finish]');
  await page.waitForSelector('[data-testid=modal-home]');
  await wait(300);
  await page.evaluate(() => document.querySelector('.overlay .modal')?.scrollTo(0, 400));
}
await wait(4000);
await home();

/* 3. Mangalyaan porkchop */
await page.click('[data-testid=mission-mangalyaan]');
await page.click('[data-testid=start]');
await caption('Mangalyaan: choose a real launch window', 'Each square is a real Earth→Mars trajectory solved with Lambert’s problem');
await page.waitForSelector('[data-testid=launch]:not([disabled])', { timeout: 120000 });
await wait(5000);
await page.click('button[aria-label=Back]');
await page.waitForSelector('[data-testid=start]');
await page.click('button[aria-label=Back]');
await home();

/* 4. Perseverance */
await page.click('[data-testid=mission-perseverance]');
await page.click('[data-testid=start]');
await page.waitForSelector('[data-testid=guided]');
await wait(600);
await clearToasts();
await caption('Perseverance: seven minutes of terror', 'NASA Glenn Mars atmosphere, real drag, lift and heating');
await wait(3000);
await page.click('[data-testid=guided]');
await page.evaluate(() => window.__LW.current.setSpeed(4));
await wait(5000);
await caption('Open the parachute inside its real window', 'Only between about Mach 2.2 and Mach 1.1, or it tears');
await page.evaluate(() => window.__LW.current.setSpeed(10));
await page.waitForFunction(() => window.__LW.current.entry?.phase === 'chute', null, { timeout: 120000 });
await wait(2500);
await page.waitForSelector('[data-testid=autoland]', { timeout: 120000 });
await wait(800);
await clearToasts();
await caption('Sky-crane landing', 'Real thrust, throttle limits and fuel. Land slowly on safe ground.');
await page.click('[data-testid=autoland]');
await page.waitForSelector('.overlay .modal', { timeout: 120000 });
await caption('Touchdown confirmed on Mars', '');
await wait(4000);
await home();

/* 5. A discovery lab */
await page.evaluate(() => window.scrollTo(0, 2000));
await page.click('[data-testid=lab-exoplanet]');
await wait(500);
await caption('Discovery labs: find the first exoplanet', 'Fit the real wobble of 51 Pegasi, like Mayor & Queloz (Nobel Prize 2019)');
await wait(2000);
for (const [k, v] of [['P', 4.2308], ['K', 55.8], ['ph', 0.37]]) {
  await page.$eval(`[data-testid=fit-${k}]`, (el, val) => ((el.value = val), el.oninput()), v);
  await wait(1300);
}
await wait(3000);
await page.click('button[aria-label=Back]');
await page.waitForSelector('[data-testid=mission-chandrayaan3]');

/* 6. Explorer */
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('text=Solar System now');
await wait(500);
await caption('The Solar System on any date', 'Scrub ±10 years; find the next real Mars launch window');
for (let d = 0; d <= 900; d += 30) {
  await page.$eval('input[type=range]', (el, v) => ((el.value = v), el.oninput()), d);
  await wait(60);
}
await page.click('text=When is the next Mars launch window?');
await noBusy();
await page.evaluate(() => window.scrollTo(0, 2000));
await wait(4000);

/* End card */
await page.click('button[aria-label=Back]');
await page.waitForSelector('[data-testid=mission-chandrayaan3]');
await caption('Launch Window: real missions · real physics', 'Every mission proven flyable with the real fuel load · works offline · Android & web');
await wait(5000);
await ctx.close();
await browser.close();
console.log('demo recorded in', OUT);
