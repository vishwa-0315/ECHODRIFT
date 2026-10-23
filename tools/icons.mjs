/** Renders the app icon (SVG) once at 1024 px per variant, then scales with ImageMagick. */
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const art = (bg, vb) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="1024" height="1024">
${bg ? '<rect x="0" y="0" width="108" height="108" fill="#04060b"/>' : ''}
<defs><radialGradient id="e" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#8fdcff"/><stop offset="0.5" stop-color="#2a73c9"/><stop offset="1" stop-color="#0a1f40"/></radialGradient>
<radialGradient id="m" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f2f2f2"/><stop offset="1" stop-color="#7a7a7a"/></radialGradient></defs>
<g fill="#ffffff" opacity="0.8"><circle cx="30" cy="34" r="0.7"/><circle cx="70" cy="76" r="0.6"/><circle cx="78" cy="62" r="0.5"/><circle cx="40" cy="80" r="0.5"/><circle cx="60" cy="28" r="0.6"/></g>
<ellipse cx="57" cy="53" rx="27" ry="14" transform="rotate(-28 57 53)" fill="none" stroke="#ff9933" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="5.5 3.5"/>
<circle cx="45" cy="60" r="12.5" fill="url(#e)"/>
<circle cx="79" cy="40" r="5.2" fill="url(#m)"/>
</svg>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 1024 } })).newPage();
const tmp = '/tmp/claude-0/icons';
mkdirSync(tmp, { recursive: true });
for (const [name, svg] of [['full', art(true, '18 18 72 72')], ['fg', art(false, '0 0 108 108')]]) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: `${tmp}/${name}.png`, omitBackground: true, timeout: 120000 });
}
await browser.close();
const res = 'android/app/src/main/res';
const im = (...a) => execFileSync('convert', a);
for (const [d, k] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const dir = `${res}/mipmap-${d}`;
  mkdirSync(dir, { recursive: true });
  const s = 48 * k;
  im(`${tmp}/full.png`, '-resize', `${s}x${s}`, `${dir}/ic_launcher.png`);
  im(`${tmp}/full.png`, '-resize', `${s}x${s}`, '(', '-size', `${s}x${s}`, 'xc:none', '-fill', 'white', '-draw', `circle ${s / 2},${s / 2} ${s / 2},0`, ')', '-compose', 'DstIn', '-composite', `${dir}/ic_launcher_round.png`);
  im(`${tmp}/fg.png`, '-resize', `${108 * k}x${108 * k}`, `${dir}/ic_launcher_foreground.png`);
}
im(`${tmp}/full.png`, '-resize', '512x512', 'assets/icon-512.png');
writeFileSync('assets/icon.svg', art(true, '18 18 72 72'));
writeFileSync(`${res}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#04060B</color>\n</resources>\n');
console.log('icons written');
