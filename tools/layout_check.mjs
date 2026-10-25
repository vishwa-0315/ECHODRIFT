/**
 * Layout check: plays every quick level (Vyom flies) on several screen sizes,
 * takes screenshots and reports overlapping HUD elements, text cut off, and
 * anything sticking out of the screen. Usage: node tools/layout_check.mjs outDir
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/claude-0/layout';
mkdirSync(OUT, { recursive: true });
const ALL_SIZES = [
  ['small', 360, 640],
  ['phone', 390, 844],
  ['tablet', 820, 1180],
];
const ALL_IDS = ['earthrise', 'eagle', 'home13', 'slingshot', 'rohini', 'cassini', 'sre1', 'mip', 'window', 'escape', 'marscapture', 'pluto', 'astrosat', 'juno', 'sats104', 'terror', 'dodge', 'navic', 'lvm3', 'raise', 'moonshot', 'catchmoon', 'hazard', 'vikram', 'pragyan', 'hop', 'aditya', 'insat', 'pushpak', 'spadex'];
const SIZES = process.env.SIZES ? ALL_SIZES.filter((s) => process.env.SIZES.split(',').includes(s[0])) : ALL_SIZES;
const IDS = process.env.IDS ? process.env.IDS.split(',') : ALL_IDS;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const problems = [];

// checks run inside the page
const CHECK = () => {
  const out = [];
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && el.textContent.trim() !== '';
  };
  const box = (el) => el.getBoundingClientRect();
  const hit = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
  const sel = ['.play-top .play-title', '.cam-btn', '.play-info', '.fuel', '.chute-light', '.play-alert', '.demo-banner', '.guide.show .bubble', '.aim-row', '.big-btn'];
  const els = sel.map((s) => [s, document.querySelector(s)]).filter(([, e]) => vis(e));
  for (let i = 0; i < els.length; i++)
    for (let j = i + 1; j < els.length; j++) {
      const [sa, a] = els[i], [sb, b] = els[j];
      if (sa === '.play-top .play-title' && sb === '.cam-btn') continue;
      if (hit(box(a), box(b))) out.push(`overlap: ${sa} × ${sb}`);
    }
  const W = innerWidth, H = innerHeight;
  for (const el of document.querySelectorAll('.play *, .home *, .result-card *, .badge-grid *, .skin-grid *')) {
    if (!vis(el) || el.closest('canvas') || el.tagName === 'CANVAS') continue;
    const r = box(el);
    if (r.right > W + 1 || r.left < -1) out.push(`off-screen sideways: ${el.className || el.tagName} "${el.textContent.trim().slice(0, 30)}"`);
    const cs = getComputedStyle(el);
    if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0) out.push(`text cut off: ${el.className} "${el.textContent.trim().slice(0, 40)}"`);
  }
  if (document.documentElement.scrollWidth > W + 1) out.push('page scrolls sideways');
  return [...new Set(out)];
};

for (const [name, W, H] of SIZES) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: W < 700 })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
  await page.waitForSelector('[data-testid=play]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}-home.png`, fullPage: true });
  for (const p of await page.evaluate(CHECK)) problems.push(`${name} home: ${p}`);
  for (const id of IDS) {
    // intro (guide bubble) state
    await page.evaluate((id) => window.__LW.go('play', { id }), id);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}-${id}-0intro.png` });
    for (const p of await page.evaluate(CHECK)) problems.push(`${name} ${id} intro: ${p}`);
    // Vyom flies it: sample a few moments
    await page.evaluate((id) => window.__LW.go('play', { id, demo: true }), id);
    for (let k = 1; k <= 4; k++) {
      await page.waitForTimeout(k === 1 ? 2200 : 2600);
      if (await page.$('.result-card')) break;
      await page.screenshot({ path: `${OUT}/${name}-${id}-${k}.png` });
      for (const p of await page.evaluate(CHECK)) problems.push(`${name} ${id} t${k}: ${p}`);
    }
    await page.waitForSelector('.result-card', { timeout: 120000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-${id}-9end.png` });
    for (const p of await page.evaluate(CHECK)) problems.push(`${name} ${id} end: ${p}`);
    const st = await page.evaluate(() => window.__LW.current.game.status);
    if (st !== 'won') problems.push(`${name} ${id}: Vyom did not win (${st})`);
  }
  // win screen + quiz on a real (non-demo) win
  await page.evaluate(() => window.__LW.go('play', { id: 'hop' }));
  await page.click('[data-testid=main-btn]');
  await page.evaluate(() => {
    const s = window.__LW.current, btn = document.querySelector('[data-testid=main-btn]');
    let held = false;
    setInterval(() => {
      const b = s.game.bot();
      if (b.hold && !held) (btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), (held = true));
      if (!b.hold && held) (btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), (held = false));
    }, 16);
  });
  await page.waitForSelector('.result-card');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${name}-win.png` });
  for (const p of await page.evaluate(CHECK)) problems.push(`${name} win: ${p}`);
  await page.click('[data-testid=continue]');
  await page.waitForSelector('[data-testid=quiz-0]');
  await page.click('[data-testid=quiz-0]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-quiz.png` });
  for (const p of await page.evaluate(CHECK)) problems.push(`${name} quiz: ${p}`);
  await page.evaluate(() => window.__LW.go('hangar'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-hangar.png`, fullPage: true });
  for (const p of await page.evaluate(CHECK)) problems.push(`${name} hangar: ${p}`);
  for (const e of errs) problems.push(`${name} page error: ${e}`);
  await page.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'No layout problems found');
