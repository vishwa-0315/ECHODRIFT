// Screenshot every quick-play level mid-flight and at the end, flown by the bot (dev aid).
import { chromium } from 'playwright-core';
const OUT = process.argv[2] || '/tmp/claude-0/ql';
const ids = ['raise', 'moonshot', 'catchmoon', 'vikram', 'window', 'marscapture', 'terror', 'slingshot'];
const at = { raise: 2.5, moonshot: 4, catchmoon: 4, vikram: 14, window: 8, marscapture: 3, terror: 9, slingshot: 12 };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await page.waitForSelector('[data-testid=play]');
for (const id of ids.filter((x) => !process.argv[3] || x === process.argv[3])) {
  await page.evaluate((id) => window.__LW.go('play', { id, demo: true }), id);
  await page.waitForTimeout(1600 + at[id] * 1000);
  await page.screenshot({ path: `${OUT}/${id}-a.png` });
  if (id === 'terror') {
    await page.waitForFunction(() => window.__LW.current.game.phase === 'land' || window.__LW.current.game.status !== 'play', null, { timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/${id}-b.png` });
  }
  await page.waitForSelector('.result-card', { timeout: 120000 });
  await page.screenshot({ path: `${OUT}/${id}-z.png` });
  console.log(id, await page.evaluate(() => window.__LW.current.game.status + ' ' + window.__LW.current.game.stars));
}
console.log('errors', errors);
await browser.close();
