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
import { expertScreen } from './ui/screens/expert.js';
import { playScreen } from './ui/screens/play.js';
import { hangarScreen } from './ui/screens/hangar.js';
import { sandboxScreen } from './ui/screens/sandbox.js';
import { quizGameScreen } from './ui/screens/quizgame.js';
import { setAudio, unlockAudio } from './ui/audio.js';

const screens = { home: homeScreen, expert: expertScreen, play: playScreen, hangar: hangarScreen, sandbox: sandboxScreen, quizgame: quizGameScreen, briefing: briefingScreen, orbital: orbitalScreen, porkchop: porkchopScreen, lander: landerScreen, edl: edlScreen, lab: labScreen, explorer: explorerScreen, about: aboutScreen };

async function boot() {
  const root = document.getElementById('app');
  await loadTextures();
  const app = createApp(root, { missions, design }, screens);
  setAudio({ music: app.settings.music !== false, sounds: app.settings.sound !== false });
  // browsers only allow sound after the first touch
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio);
  const deep = location.hash.slice(1);
  if (deep && missions.some((m) => m.id === deep)) app.go('briefing', { id: deep });
  else app.go('home');
  try {
    window.Capacitor?.Plugins?.App?.addListener('backButton', () => {
      if (root.querySelector('.overlay')) return;
      if (app.currentName === 'home') window.Capacitor.Plugins.App.minimizeApp?.();
      else if (['briefing', 'orbital', 'porkchop', 'lander', 'edl', 'lab'].includes(app.currentName)) app.go('expert');
      else app.go('home');
    });
  } catch {
    /* plain browser */
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
