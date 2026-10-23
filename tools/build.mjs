/**
 * Build: bundles src/ + content/ into ONE self-contained offline HTML file
 * (fonts inlined) at dist/index.html, and copies it to www/ for Capacitor.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
// 1) Lint content first — a broken JSON fails the build.
execSync('node tools/validate_content.mjs', { cwd: root, stdio: 'inherit' });

const res = await build({
  entryPoints: [root + 'src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome80', 'safari14'],
  write: false,
  loader: { '.json': 'json' },
  legalComments: 'none',
});
const js = res.outputFiles[0].text;
const css = readFileSync(root + 'src/styles.css', 'utf8');
const font = (pkg, file) => readFileSync(root + `node_modules/@fontsource/${pkg}/files/${file}`).toString('base64');
const fonts = `
@font-face{font-family:'Atkinson Hyperlegible';font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${font('atkinson-hyperlegible', 'atkinson-hyperlegible-latin-400-normal.woff2')}) format('woff2')}
@font-face{font-family:'Atkinson Hyperlegible';font-weight:700;font-display:swap;src:url(data:font/woff2;base64,${font('atkinson-hyperlegible', 'atkinson-hyperlegible-latin-700-normal.woff2')}) format('woff2')}
@font-face{font-family:'OpenDyslexic';font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${font('opendyslexic', 'opendyslexic-latin-400-normal.woff2')}) format('woff2')}
@font-face{font-family:'OpenDyslexic';font-weight:700;font-display:swap;src:url(data:font/woff2;base64,${font('opendyslexic', 'opendyslexic-latin-700-normal.woff2')}) format('woff2')}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#080a1c">
<meta name="description" content="ECHO DRIFT: an educational space-mystery game. Fly with gravity, solve the Orrin mystery, learn real space science.">
<title>Echo Drift</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#080a1c"/><circle cx="32" cy="32" r="12" fill="#3ff0d2"/><circle cx="32" cy="32" r="22" fill="none" stroke="#ff5fa2" stroke-width="3" stroke-dasharray="6 5"/></svg>')}">
<style>${fonts}\n${css}</style>
</head>
<body>
<div id="app" aria-live="off"></div>
<noscript>ECHO DRIFT needs JavaScript to run.</noscript>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
mkdirSync(root + 'dist', { recursive: true });
mkdirSync(root + 'www', { recursive: true });
writeFileSync(root + 'dist/index.html', html);
copyFileSync(root + 'dist/index.html', root + 'www/index.html');
// Artifact variant (hosted page): same content without the document wrapper.
const artifact = html
  .replace(/^<!doctype html>\n<html lang="en">\n<head>\n/, '')
  .replace('<meta charset="utf-8">\n', '')
  .replace(/<meta name="viewport"[^>]*>\n/, '')
  .replace('</head>\n<body>\n', '')
  .replace('</body>\n</html>', '');
const titleFirst = '<title>Echo Drift</title>\n' + artifact.replace('<title>Echo Drift</title>\n', '');
writeFileSync(root + 'dist/echo-drift.html', titleFirst);
const kb = (statSync(root + 'dist/index.html').size / 1024).toFixed(0);
console.log(`✓ Built dist/index.html (${kb} KB, fully offline) and www/index.html`);
