/**
 * Build: one self-contained offline HTML file (code, fonts, images inlined):
 *   dist/index.html      — open directly, or host anywhere (GitHub Pages)
 *   dist/launch-window.html — same, without the document wrapper (for hosted previews)
 *   www/index.html       — copy for the Capacitor Android app
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const res = await build({ entryPoints: [root + 'src/main.js'], bundle: true, minify: true, format: 'iife', target: ['chrome80', 'safari14'], write: false, loader: { '.json': 'json', '.jpg': 'dataurl' }, legalComments: 'none', define: { __BUILD__: JSON.stringify(process.env.GITHUB_RUN_NUMBER || '0') } });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(root + 'src/styles.css', 'utf8');
const f = (pkg, file) => readFileSync(root + `node_modules/@fontsource/${pkg}/files/${file}`).toString('base64');
const face = (fam, w, b64) => `@font-face{font-family:'${fam}';font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
const fonts = [
  ...[400, 500, 600, 700, 800].map((w) => face('Inter', w, f('inter', `inter-latin-${w}-normal.woff2`))),
].join('\n');
const icon = `data:image/svg+xml,${encodeURIComponent(readFileSync(new URL('../assets/icon.svg', import.meta.url), 'utf8'))}`;
const head = `<title>Launch Window</title>
<meta name="description" content="Fly real ISRO and NASA missions with real physics: Chandrayaan-3, Mangalyaan, Aditya-L1, Apollo 11 & 13, Voyager 2, Perseverance.">
<meta name="theme-color" content="#04060b">
<link rel="icon" href="${icon}">
<style>${fonts}\n${css}</style>`;
const bodyHtml = `<div id="app"></div>\n<noscript>Launch Window needs JavaScript.</noscript>\n<script>${js}</script>`;
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src https://api.github.com; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'">\n<meta name="referrer" content="no-referrer">\n${head}\n</head>\n<body>\n${bodyHtml}\n</body>\n</html>\n`;
mkdirSync(root + 'dist', { recursive: true });
mkdirSync(root + 'www', { recursive: true });
writeFileSync(root + 'dist/index.html', full);
writeFileSync(root + 'dist/launch-window.html', head + '\n' + bodyHtml + '\n');
copyFileSync(root + 'dist/index.html', root + 'www/index.html');
console.log(`✓ dist/index.html ${(statSync(root + 'dist/index.html').size / 1024).toFixed(0)} KB (fully offline)`);
