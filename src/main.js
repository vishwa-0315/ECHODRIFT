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
import { certsScreen } from './ui/screens/certs.js';
import { quizGameScreen } from './ui/screens/quizgame.js';
import { introScreen } from './ui/screens/intro.js';
import { levelsScreen } from './ui/screens/levels.js';
import { profileScreen } from './ui/screens/profile.js';
import { settingsScreen } from './ui/screens/settings.js';
import { autoHelp } from './ui/tour.js';
import { setAudio, unlockAudio } from './ui/audio.js';

const screens = { home: homeScreen, menu: homeScreen, intro: introScreen, levels: levelsScreen, profile: profileScreen, settings: settingsScreen, expert: expertScreen, play: playScreen, hangar: hangarScreen, sandbox: sandboxScreen, certs: certsScreen, quizgame: quizGameScreen, briefing: briefingScreen, orbital: orbitalScreen, porkchop: porkchopScreen, lander: landerScreen, edl: edlScreen, lab: labScreen, explorer: explorerScreen, about: aboutScreen };

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
  else if (!app.settings.introDone && autoHelp(app)) app.go('intro');
  else app.go('home');
  try {
    window.Capacitor?.Plugins?.App?.addListener('backButton', () => {
      if (root.querySelector('.overlay')) return;
      if (app.currentName === 'home') window.Capacitor.Plugins.App.minimizeApp?.();
      else if (app.root.querySelector('.tour')) app.root.querySelector('[data-testid="tour-skip"]')?.click();
      else if (['briefing', 'orbital', 'porkchop', 'lander', 'edl', 'lab'].includes(app.currentName)) app.go('expert');
      else if (app.currentName === 'play') app.go('levels');
      else if (!app.settings.introDone && autoHelp(app)) app.go('intro');
  else app.go('home');
    });
  } catch {
    /* plain browser */
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
