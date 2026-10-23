/** LAUNCH WINDOW — entry point. */
import missions from '../content/missions.json';
import design from '../content/mission_design.json';
import { createApp } from './ui/app.js';
import { loadTextures } from './ui/render.js';
import { homeScreen } from './ui/screens/home.js';
import { briefingScreen } from './ui/screens/briefing.js';
import { orbitalScreen } from './ui/screens/orbital.js';
import { porkchopScreen } from './ui/screens/porkchop.js';
import { landerScreen } from './ui/screens/lander.js';
import { edlScreen } from './ui/screens/edl.js';
import { labScreen } from './ui/screens/lab.js';
import { explorerScreen } from './ui/screens/explorer.js';
import { aboutScreen } from './ui/screens/about.js';

const screens = { home: homeScreen, briefing: briefingScreen, orbital: orbitalScreen, porkchop: porkchopScreen, lander: landerScreen, edl: edlScreen, lab: labScreen, explorer: explorerScreen, about: aboutScreen };

async function boot() {
  const root = document.getElementById('app');
  await loadTextures();
  const app = createApp(root, { missions, design }, screens);
  const deep = location.hash.slice(1);
  if (deep && missions.some((m) => m.id === deep)) app.go('briefing', { id: deep });
  else app.go('home');
  try {
    window.Capacitor?.Plugins?.App?.addListener('backButton', () => {
      if (root.querySelector('.overlay')) return;
      if (app.currentName === 'home') window.Capacitor.Plugins.App.minimizeApp?.();
      else app.go('home');
    });
  } catch {
    /* plain browser */
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
