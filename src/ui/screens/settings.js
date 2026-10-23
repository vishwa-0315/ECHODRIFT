/** Settings + hidden debug menu (tap the version 5 times). */
import { h, clear, put } from '../dom.js';
import { t, languages } from '../i18n.js';
import { topbar } from './common.js';
import { VERSION } from '../app.js';
import { PHASES } from '../../core/save.js';

export function settingsScreen(app, { from } = {}) {
  const root = h('div.screen');
  let taps = 0;
  function sw(key, label) {
    const on = !!app.settings[key];
    return h('div.setting', h('span', label), h('button.switch', { role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label, 'data-testid': 'set-' + key, onclick: () => (app.setSetting(key, !on), app.sfx('click'), draw()) }));
  }
  function seg(key, label, options) {
    return h('div.setting', h('span', label), h('div.seg', { role: 'group', 'aria-label': label }, options.map(([v, l]) => h('button', { 'aria-pressed': app.settings[key] === v ? 'true' : 'false', onclick: () => (app.setSetting(key, v), app.sfx('click'), draw()) }, l))));
  }
  function draw() {
    put(clear(root), 
      topbar(app, t('nav.settings'), { back: from === 'title' ? 'title' : 'map' }),
      h('div.kicker', t('set.sound')),
      sw('sound', t('set.soundFx')),
      sw('music', t('set.music')),
      sw('haptics', t('set.haptics')),
      h('div.kicker', { style: { marginTop: '14px' } }, t('set.play')),
      seg('track', t('set.track'), [
        ['cadet', t('track.cadet')],
        ['commander', t('track.commander')],
      ]),
      seg('lang', t('set.lang'), languages().map((l) => [l.id, l.name])),
      h('div.kicker', { style: { marginTop: '14px' } }, t('set.access')),
      seg('textSize', t('set.textSize'), [
        [0.9, 'A-'],
        [1, 'A'],
        [1.15, 'A+'],
        [1.3, 'A++'],
      ]),
      sw('colorblind', t('set.colorblind')),
      sw('reduceMotion', t('set.reduceMotion')),
      sw('dyslexiaFont', t('set.dyslexia')),
      seg('graphics', t('set.graphics'), [
        ['high', t('set.high')],
        ['saver', t('set.saver')],
      ]),
      h('p.small.muted', { style: { marginTop: '16px' } }, t('set.privacy')),
      h('p.small.muted.center', { onclick: () => ++taps >= 5 && debug(), style: { padding: '12px', cursor: 'default' } }, `ECHO DRIFT v${VERSION}`),
    );
  }

  function debug() {
    taps = 0;
    const box = h('div.col');
    const btn = (label, fn) => h('button.btn', { onclick: () => (fn(), app.toast('✓ ' + label)) }, label);
    put(box, 
      h('h2', '🛠 Debug'),
      btn('Unlock all worlds', () => {
        for (const w of app.content.worlds) if (w.status === 'playable') app.ws(w.id).unlocked = true;
        app.save.sandboxUnlocked = true;
        app.persist();
      }),
      ...app.content.worlds
        .filter((w) => w.status === 'playable')
        .map((w) =>
          btn(`Skip ${w.id} → next phase`, () => {
            const ws = app.ws(w.id);
            ws.unlocked = true;
            app.advance(w.id, ws.phase);
          }),
        ),
      btn('Reset tutorials', () => ((app.save.tutorialsSeen = {}), app.persist())),
      btn('Reset ALL progress', () => {
        app.store.clear();
        location.reload();
      }),
      h('div.small.muted', `Phases: ${PHASES.join(' → ')}`),
      h('div.small.muted', `Save source: ${app.saveSource} · content errors: ${app.contentErrors.length}`),
      app.contentErrors.length ? h('div.err', app.contentErrors.join('\n')) : null,
      h('div.err', app.log.length ? app.log.map((l) => `${l.at}\n${l.msg}`).join('\n\n') : 'No errors logged.'),
    );
    app.modal(box);
  }

  draw();
  return { el: root };
}
