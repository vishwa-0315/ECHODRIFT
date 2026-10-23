/**
 * ECHO DRIFT — entry point. Wires content + screens into the app shell.
 */
import { content } from './content.js';
import { createApp } from './ui/app.js';
import { titleScreen } from './ui/screens/title.js';
import { mapScreen } from './ui/screens/map.js';
import { introScreen } from './ui/screens/intro.js';
import { flightScreen } from './ui/screens/flight.js';
import { investigateScreen } from './ui/screens/investigate.js';
import { colonyScreen } from './ui/screens/colony.js';
import { reportScreen } from './ui/screens/report.js';
import { forgeScreen } from './ui/screens/forge.js';
import { debriefScreen } from './ui/screens/debrief.js';
import { logbookScreen } from './ui/screens/logbook.js';
import { settingsScreen } from './ui/screens/settings.js';
import { parentScreen } from './ui/screens/parent.js';
import { sandboxScreen } from './ui/screens/sandbox.js';

const screens = {
  title: titleScreen,
  map: mapScreen,
  intro: introScreen,
  flight: flightScreen,
  investigate: investigateScreen,
  colony: colonyScreen,
  report: reportScreen,
  forge: forgeScreen,
  debrief: debriefScreen,
  logbook: logbookScreen,
  settings: settingsScreen,
  parent: parentScreen,
  sandbox: sandboxScreen,
};

function boot() {
  const root = document.getElementById('app');
  const app = createApp(root, content, screens);
  app.go('title');
  // Android hardware back button (Capacitor App plugin, if present): close an
  // open dialog first, otherwise step back toward the map/title.
  const onBack = () => {
    const ov = root.querySelector('.overlay .modal button');
    if (ov) return; // modals need an explicit choice
    if (app.currentName === 'title') return window.Capacitor?.Plugins?.App?.minimizeApp?.();
    app.go(app.currentName === 'map' ? 'title' : 'map');
  };
  try {
    window.Capacitor?.Plugins?.App?.addListener('backButton', onBack);
  } catch {
    /* running in a plain browser */
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
