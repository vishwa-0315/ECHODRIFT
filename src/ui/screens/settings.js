/** Settings: sound, music, voice, tips, demos, text size, motion, tutorials, updates and reset. */
import { h } from '../dom.js';
import { progress } from '../../game/progress.js';
import { cautionReset } from '../caution.js';
import { voiceAvailable } from '../guide.js';
import { checkForUpdates, BUILD } from '../update.js';
import { setAudio, startMusic, sfx, unlockAudio } from '../audio.js';

export function settingsScreen(app) {
  const prog = progress(app);
  const S = app.settings;
  const sw = (key, label, sub, { on = (v) => v !== false, flip = (v) => v === false, after } = {}) => {
    const b = h('button.switch', { role: 'switch', 'data-testid': 'set-' + key, 'aria-label': label });
    const paint = () => b.setAttribute('aria-checked', String(on(S[key])));
    b.onclick = () => {
      unlockAudio();
      app.setSetting(key, flip(S[key]));
      paint();
      after?.();
      sfx.tap();
    };
    paint();
    return h('div.set-row', h('div.grow', h('b', label), sub ? h('div.small.muted', sub) : null), b);
  };
  const audio = () => {
    setAudio({ music: S.music !== false, sounds: S.sound !== false });
    if (S.music !== false) startMusic('menu');
  };
  const size = h(
    'div.seg',
    { role: 'group', 'aria-label': 'Text size' },
    [
      [0.9, 'Small'],
      [1, 'Normal'],
      [1.15, 'Large'],
      [1.3, 'Extra large'],
    ].map(([v, l]) => h('button' + (Math.abs((S.textSize || 1) - v) < 0.01 ? '.on' : ''), { 'data-testid': 'ts-' + v, onclick: (e) => (app.setSetting('textSize', v), [...e.target.parentNode.children].forEach((c) => c.classList.toggle('on', c === e.target)), sfx.tap()) }, l)),
  );
  const el = h(
    'div.screen.settings',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back to menu', 'data-testid': 'back', onclick: () => app.go('home') }, '←'), h('h2', 'Settings')),
    h('div.section', h('h3', 'Sound')),
    h(
      'div.set-list',
      sw('music', 'Music', 'Original space music', { after: audio }),
      sw('sound', 'Sound effects', 'Engines, stars and clicks', { after: audio }),
      voiceAvailable() ? sw('voice', 'Vyom’s voice', 'Vyom reads his lines aloud', { on: (v) => v === true, flip: (v) => v !== true }) : null,
    ),
    h('div.section', h('h3', 'Help')),
    h(
      'div.set-list',
      sw('coach', 'Vyom’s tips during flights', 'Only after two misses on a level you have not won yet'),
      sw('autoHelp', 'Tours and demos', 'Page tours for new players, and Vyom’s demo before your first try and after a miss'),
      h('div.set-row', h('div.grow', h('b', 'Show the intro again'), h('div.small.muted', 'The welcome slides about the game')), h('button.btn.sm', { 'data-testid': 'replay-intro', onclick: () => (sfx.tap(), app.go('intro', { replay: true })) }, 'Show')),
      h('div.set-row', h('div.grow', h('b', 'Replay all page tours'), h('div.small.muted', 'Every page shows its short tour again')), h('button.btn.sm', { 'data-testid': 'reset-tours', onclick: () => (app.setSetting('tours', {}), app.setSetting('autoHelp', true), app.setSetting('demosSeen', {}), sfx.tap(), app.toast('Tours and demos will show again.', 2200, 'happy')) }, 'Replay')),
    ),
    h('div.section', h('h3', 'Display')),
    h('div.set-list', h('div.set-row.col', h('b', 'Text size'), size), sw('reduceMotion', 'Reduce motion', 'No countdown, confetti or rocket hop', { on: (v) => !!v, flip: (v) => !v })),
    h('div.section', h('h3', 'App')),
    h(
      'div.set-list',
      h('div.set-row', h('div.grow', h('b', 'Version'), h('div.small.muted', `1.0.${BUILD || 0} (build ${BUILD || 'test'})`)), h('button.btn.sm', { 'data-testid': 'updates', onclick: () => checkForUpdates(app) }, 'Check for updates')),
      h(
        'div.set-row',
        h('div.grow', h('b', 'Reset progress'), h('div.small.muted', 'Deletes stars, badges, ranks and certificates on this device')),
        h('button.btn.sm.danger', {
          'data-testid': 'reset-progress',
          onclick: () => cautionReset(app, () => (prog.resetProgress(), app.toast('Progress reset. A fresh start!', 2400, 'happy'), app.go('home'))),
        }, 'Reset'),
      ),
    ),
  );
  return {
    el,
    tour: [
      { sel: '.set-list', title: 'Sound', text: 'Turn music, sound effects and Vyom’s voice on or off.' },
      { sel: '[data-testid="set-autoHelp"]', title: 'Tours and demos', text: 'Switch off the tours and Vyom’s demos once you know your way around.' },
      { sel: '[data-testid="updates"]', title: 'Updates', text: 'Check here for a newer version of the game.' },
    ],
  };
}
