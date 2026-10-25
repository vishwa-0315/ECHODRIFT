/**
 * Check for updates: asks GitHub for the newest Launch Window release and, if it
 * is newer than this copy, offers to download the APK straight from GitHub.
 */
import { h } from './dom.js';
import { vyomSVG } from './guide.js';

/* global __BUILD__ */
export const BUILD = Number(typeof __BUILD__ !== 'undefined' ? __BUILD__ : 0) || 0;
const REPO = 'vishwa-0315/ECHODRIFT';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
const isApp = () => !!window.Capacitor?.isNativePlatform?.();

/** Open a link outside the app (the system browser downloads the APK and Android installs it). */
function openExternal(url) {
  if (isApp()) window.location.href = url; // Capacitor hands non-app links to the system browser
  else window.open(url, '_blank', 'noopener');
}

export async function checkForUpdates(app) {
  const panel = h('div');
  const face = h('div.modal-vyom');
  face.innerHTML = vyomSVG('normal', 64);
  const ov = h('div.overlay.guide-overlay', { role: 'dialog', 'aria-modal': 'true' }, h('div.modal', face, h('h2', 'Check for updates'), panel));
  const close = h('button.btn', { onclick: () => ov.remove(), 'data-testid': 'update-close' }, 'Close');
  panel.replaceChildren(h('p', 'Asking GitHub for the newest version…'));
  app.root.appendChild(ov);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('GitHub answered ' + res.status);
    const rel = await res.json();
    const latest = Number(String(rel.tag_name || '').replace(/\D+/g, '')) || 0;
    const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
    const apkUrl = apk?.browser_download_url || RELEASES;
    const when = rel.published_at ? new Date(rel.published_at).toISOString().slice(0, 10) : '';
    const ver = (n) => `version 1.0.${n} (build ${n})`;
    const yours = BUILD ? ver(BUILD) : 'a test build';
    if (!isApp()) {
      panel.replaceChildren(
        h('p', 'You are playing the web version, which is always the newest.'),
        h('p.small.muted', `Newest Android app: ${ver(latest)}${when ? `, ${when}` : ''}.`),
        h('div.row.wrap', { style: { marginTop: '12px', justifyContent: 'flex-end' } }, close, h('button.btn.primary', { onclick: () => openExternal(apkUrl), 'data-testid': 'update-download' }, `Download the Android app (v1.0.${latest})`)),
      );
    } else if (latest > BUILD) {
      face.innerHTML = vyomSVG('happy', 64);
      panel.replaceChildren(
        h('p', h('b', `A new version is ready: ${ver(latest)}`), when ? `, ${when}` : '', `. You have ${yours}.`),
        h('p.small', 'Tap Download. When it finishes, open the file and tap Install. Your stars and badges are kept.'),
        BUILD && BUILD < 9 ? h('p.small.muted', 'One-time step: if Android says the app "conflicts with an existing package", uninstall this version first, then install the new one. From version 1.0.9 on, updates install straight over the top.') : null,
        h('div.row.wrap', { style: { marginTop: '12px', justifyContent: 'flex-end' } }, close, h('button.btn.primary', { onclick: () => openExternal(apkUrl), 'data-testid': 'update-download' }, `Download v1.0.${latest}`)),
      );
    } else {
      face.innerHTML = vyomSVG('happy', 64);
      panel.replaceChildren(h('p', `You have the newest version (${yours}).`), h('div.row.wrap', { style: { marginTop: '12px', justifyContent: 'flex-end' } }, h('button.btn', { onclick: () => openExternal(RELEASES) }, 'See all releases'), close));
    }
  } catch (e) {
    face.innerHTML = vyomSVG('sad', 64);
    panel.replaceChildren(
      h('p', 'Could not reach GitHub. Check your internet connection and try again.'),
      h('p.small.muted', String(e.message || e)),
      h('div.row.wrap', { style: { marginTop: '12px', justifyContent: 'flex-end' } }, close, h('button.btn.primary', { onclick: () => openExternal(RELEASES) }, 'Open the releases page')),
    );
  }
}
