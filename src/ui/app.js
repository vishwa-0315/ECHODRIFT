/** App shell: navigation, progress save, settings, modals, toasts, audio. */
import { h, clear, put } from './dom.js';

export const VERSION = '1.0.0';
const KEY = 'launchwindow.save.v1';

function safeStore() {
  try {
    localStorage.setItem('__lw', '1');
    localStorage.removeItem('__lw');
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  }
}

export function createApp(root, content, screens) {
  const store = safeStore();
  let save;
  try {
    save = JSON.parse(store.getItem(KEY)) || null;
  } catch {
    save = null;
  }
  save = { missions: {}, labs: {}, settings: { sound: true, music: true, reduceMotion: false, textSize: 1 }, ...(save || {}) };
  save.settings = { sound: true, music: true, reduceMotion: false, textSize: 1, ...save.settings };
  let current = null;
  let actx = null;

  const app = {
    root,
    content,
    save,
    get settings() {
      return save.settings;
    },
    persist() {
      try {
        store.setItem(KEY, JSON.stringify(save));
      } catch {
        /* storage unavailable: progress lasts this session only */
      }
    },
    setSetting(k, v) {
      save.settings[k] = v;
      app.applySettings();
      app.persist();
    },
    applySettings() {
      document.documentElement.style.setProperty('--ts', save.settings.textSize);
      document.body.classList.toggle('reduce-motion', !!save.settings.reduceMotion);
    },
    record(missionId, stars, extra = {}) {
      const prev = save.missions[missionId] || { stars: 0 };
      save.missions[missionId] = { ...prev, ...extra, stars: Math.max(prev.stars || 0, stars), done: true, at: Date.now() };
      app.persist();
    },
    go(name, params = {}) {
      try {
        current?.destroy?.();
      } catch (e) {
        console.error(e);
      }
      clear(root);
      const s = screens[name](app, params) || {};
      current = s;
      app.currentName = name;
      app.current = s;
      if (s.el) root.appendChild(s.el);
      s.mounted?.();
      window.scrollTo(0, 0);
    },
    toast(msg, ms = 3200) {
      const el = h('div.toast', { role: 'status', 'aria-live': 'polite' }, msg);
      root.appendChild(el);
      setTimeout(() => el.remove(), ms);
    },
    modal(body, buttons = [{ label: 'OK', cls: 'primary', value: true }]) {
      return new Promise((resolve) => {
        const ov = h('div.overlay', { role: 'dialog', 'aria-modal': 'true' });
        const close = (v) => {
          ov.remove();
          resolve(v);
        };
        put(ov, h('div.modal', body, h('div.row.wrap', { style: { justifyContent: 'flex-end', marginTop: '14px' } }, buttons.map((b) => h('button.btn' + (b.cls ? '.' + b.cls : ''), { onclick: () => close(b.value), 'data-testid': 'modal-' + String(b.value) }, b.label)))));
        root.appendChild(ov);
        ov.querySelector('button:last-child')?.focus();
      });
    },
    /** Run a heavy computation with a "computing" overlay so the UI can paint first. */
    busy(label, fn) {
      const el = h('div.busy', label);
      root.appendChild(el);
      return new Promise((res, rej) =>
        setTimeout(() => {
          try {
            res(fn());
          } catch (e) {
            rej(e);
          } finally {
            el.remove();
          }
        }, 30),
      );
    },
    beep(freq = 880, dur = 0.08, vol = 0.08, type = 'sine') {
      if (save.settings.sound === false) return;
      try {
        actx ||= new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, actx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
        o.connect(g).connect(actx.destination);
        o.start();
        o.stop(actx.currentTime + dur + 0.02);
      } catch {
        /* audio optional */
      }
    },
    audioContext() {
      try {
        actx ||= new (window.AudioContext || window.webkitAudioContext)();
        return actx;
      } catch {
        return null;
      }
    },
    vibrate(p = 20) {
      try {
        navigator.vibrate?.(p);
      } catch {
        /* optional */
      }
    },
  };
  app.applySettings();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) current?.onPause?.();
  });
  window.__LW = app;
  return app;
}
