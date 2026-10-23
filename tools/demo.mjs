/**
 * Records the captioned gameplay demo at phone size (competition video).
 * Usage: PLAYWRIGHT_BROWSERS_PATH=… node tools/demo.mjs outDir → outDir/*.webm
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
        c.style.cssText = 'position:fixed;left:12px;right:12px;top:50%;transform:translateY(-50%);z-index:99999;pointer-events:none;background:rgba(4,6,11,0.9);border:2px solid #ff9933;border-radius:14px;padding:12px 16px;font:700 17px/1.3 Inter,system-ui,sans-serif;color:#fff;text-align:center;transition:opacity .3s';
        document.body.appendChild(c);
      }
      c.innerHTML = t ? `${t}${s ? `<div style="font-weight:500;font-size:13px;color:#c9d4e6;margin-top:4px">${s}</div>` : ''}` : '';
      c.style.opacity = t ? '1' : '0';
    },
    [text, sub],
  );
const flash = async (t, s, ms = 2600) => {
  await caption(t, s);
  await wait(ms);
  await caption('');
};
const go = (name, params) => page.evaluate(([n, p]) => window.__LW.go(n, p), [name, params]);
const result = () => page.waitForSelector('.result-card', { timeout: 120000 });

await page.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await page.waitForSelector('[data-testid=play]');

/* 1. Title + home */
await flash('Launch Window', 'Fly real ISRO & NASA missions, with real physics. One button. Lots of fun.', 3400);
await wait(2600);
for (let y = 0; y <= 700; y += 25) {
  await page.evaluate((v) => document.querySelector('.screen').scrollTo(0, v), y);
  await wait(40);
}
await flash('8 short levels from real missions', 'Chandrayaan-3 · Vikram · Mangalyaan · Perseverance · Voyager 2', 2600);
await page.evaluate(() => document.querySelector('.screen').scrollTo(0, 0));

/* 2. Level 1 played with the real button */
await page.click('[data-testid=play]');
await page.waitForSelector('[data-testid=main-btn]');
await wait(3200); // Vyom explains the goal
await page.click('[data-testid=main-btn]');
await page.evaluate(() => {
  const s = window.__LW.current;
  const btn = document.querySelector('[data-testid=main-btn]');
  let held = false;
  setInterval(() => {
    const b = s.game.bot();
    if (b.hold && !held) (btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), (held = true));
    if (!b.hold && held) (btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), (held = false));
  }, 16);
});
await result();
await wait(3800);
await flash('Stars, badges and real mission facts', '', 2200);
await page.click('[data-testid=continue]');
await page.waitForSelector('[data-testid=quiz-1]');
await wait(2200);
await page.click('[data-testid=quiz-1]');
await wait(3600);

/* 3. A tour of the other levels (flown by Vyom's demo mode) */
const tour = [
  ['moonshot', 'Moon shot', 'Stretch your path until it reaches the Moon'],
  ['vikram', 'Vikram touchdown', 'Real Moon gravity, real engines: land gently'],
  ['window', 'Mars launch window', 'Launch when Mars is 44° ahead'],
  ['terror', 'Seven minutes of terror', 'Open the parachute in its real Mach window'],
  ['slingshot', 'Jupiter slingshot', 'Borrow speed from Jupiter to reach Saturn'],
];
for (const [id, t, s] of tour) {
  await go('play', { id, demo: true });
  await caption(t, s);
  await wait(2200);
  await caption('');
  await result();
  await wait(2400);
}

/* 4. Badges & rockets, then the end card */
await go('hangar');
await flash('Unlock badges and rocket colours', 'Plus quiz cards after every level', 3200);
await go('home');
await wait(600);
await flash('Launch Window', 'Real missions · real physics · for all ages', 3600);
await ctx.close();
await browser.close();
console.log('demo recorded in', OUT);
