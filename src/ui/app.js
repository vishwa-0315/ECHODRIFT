/**
 * App shell: navigation, save/autosave, settings, lifecycle (pause/resume),
 * dialogue + tutorial overlays, toasts, haptics, error boundary.
 */
import { h, clear } from './dom.js';
import { t, L, setLang, initI18n } from './i18n.js';
import { sfx, configureAudio, unlockAudio, suspendAudio } from './audio.js';
import { portrait } from './art.js';
import { createStore, memoryStorage, PHASES, addEvidence } from '../core/save.js';
import { lintContent } from '../core/validate.js';

export const VERSION = '1.0.0';

class App {
  constructor(root, content, screens) {
    this.root = root;
    this.content = content;
    this.screens = screens;
    this.current = null;
    this.paused = false;
    this.log = [];
    let storage;
    try {
      storage = window.localStorage;
      storage.setItem('__ed_probe', '1');
      storage.removeItem('__ed_probe');
    } catch {
      storage = memoryStorage();
    }
    this.store = createStore(storage);
    this.worldIds = content.worlds.map((w) => w.id);
    const loaded = this.store.load(this.worldIds);
    this.save = loaded.save;
    this.saveSource = loaded.source;
    initI18n(content.lang, this.save.settings.lang);
    this.applySettings();
    this.contentErrors = lintContent(content);
    this._installLifecycle();
  }

  /* ---------- settings ---------- */
  get settings() {
    return this.save.settings;
  }
  get tuning() {
    return this.content.extras.tuning[this.settings.track] || this.content.extras.tuning.cadet;
  }
  applySettings() {
    const s = this.settings;
    const de = document.documentElement;
    de.style.setProperty('--ts', s.textSize);
    de.dataset.cb = s.colorblind ? '1' : '0';
    de.dataset.font = s.dyslexiaFont ? 'dyslexic' : 'default';
    document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
    setLang(s.lang);
    configureAudio(s);
  }
  setSetting(k, v) {
    this.settings[k] = v;
    this.applySettings();
    this.persist();
  }

  /* ---------- persistence ---------- */
  persist() {
    const ok = this.store.save(this.save);
    if (!ok && !this._warnedStorage) {
      this._warnedStorage = true;
      this.toast(t('err.storage'));
    }
  }
  worldDef(id) {
    return this.content.worlds.find((w) => w.id === id);
  }
  ws(id) {
    return this.save.worlds[id];
  }
  /** Mark a phase complete and move the world to the next phase (autosaves). */
  advance(worldId, fromPhase) {
    const w = this.ws(worldId);
    const idx = PHASES.indexOf(fromPhase);
    if (PHASES.indexOf(w.phase) <= idx) w.phase = PHASES[idx + 1];
    if (w.phase === 'done' && !w.complete) this._completeWorld(worldId);
    this.persist();
  }
  _completeWorld(worldId) {
    const w = this.ws(worldId);
    w.complete = true;
    const order = this.worldIds.indexOf(worldId);
    const next = this.content.worlds[order + 1];
    if (next && next.status === 'playable') this.ws(next.id).unlocked = true;
    if (worldId === this.worldIds[0]) this.save.sandboxUnlocked = true;
    for (const g of this.content.extras.gallery) if (g.unlockedBy === worldId && !this.save.logbook.gallery.includes(g.id)) this.save.logbook.gallery.push(g.id);
  }
  evidence(concepts, source) {
    for (const c of concepts || []) addEvidence(this.save, c, source);
  }
  unlockFact(id) {
    if (id && !this.save.logbook.facts.includes(id)) {
      this.save.logbook.facts.push(id);
      return true;
    }
    return false;
  }
  badge(id) {
    if (!this.save.logbook.badges.includes(id)) {
      this.save.logbook.badges.push(id);
      const b = this.content.extras.badges[id];
      this.toast(`🏅 ${t('badge.earned')}: ${L({ ...b, id: 'badge-' + id }, 'name')}`);
    }
  }
  totalStars() {
    let n = 0;
    for (const w of Object.values(this.save.worlds)) for (const s of Object.values(w.levelStars || {})) n += s;
    return n;
  }

  /* ---------- navigation ---------- */
  go(name, params = {}) {
    try {
      if (this.current?.destroy) this.current.destroy();
    } catch (e) {
      this.report(e);
    }
    clear(this.root);
    const factory = this.screens[name];
    if (!factory) throw new Error(`Unknown screen ${name}`);
    try {
      this.current = factory(this, params) || {};
      this.current.name = name;
      if (this.current.el) this.root.appendChild(this.current.el);
      this.current.mounted?.();
      const heading = this.root.querySelector('h1, h2');
      if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    } catch (e) {
      this.report(e);
      this.showError(e);
    }
    this.currentName = name;
  }
  /** Resume a world at its saved phase. */
  resumeWorld(worldId) {
    const phase = this.ws(worldId).phase;
    const map = { intro: 'intro', fly: 'flight', investigate: 'investigate', build: 'colony', report: 'report', forge: 'forge', debrief: 'debrief', done: 'map' };
    this.go(map[phase] || 'map', { world: worldId });
  }

  /* ---------- feedback ---------- */
  toast(msg, ms = 2600) {
    const el = h('div.toast', { role: 'status', 'aria-live': 'polite' }, msg);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
  haptic(pattern = 20) {
    if (!this.settings.haptics) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported */
    }
  }
  sfx(name, ...a) {
    try {
      sfx[name]?.(...a);
    } catch {
      /* audio is optional */
    }
  }

  /**
   * Play a dialogue scene. lines = [{id,s,m,t,if}]. ctx = flags for conditions.
   * Resolves when the player taps through (or skips).
   */
  dialogue(lines, ctx = {}) {
    const list = (lines || []).filter((l) => !l.if || ctx[l.if]);
    if (!list.length) return Promise.resolve();
    return new Promise((resolve) => {
      let i = 0;
      const speakers = this.content.dialogue.speakers;
      const pic = h('div.portrait');
      const who = h('div.who');
      const txt = h('div.txt', { 'aria-live': 'polite' });
      const skip = h('button.btn.ghost.small', { onclick: (e) => (e.stopPropagation(), done()), 'aria-label': t('ui.skip') }, t('ui.skip'));
      const box = h('div.dialogue', { role: 'dialog', 'aria-label': t('ui.dialogue'), tabindex: '0', onclick: () => next(), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && next() }, pic, h('div.bubble', who, txt, h('div.row', h('div.spacer'), skip, h('span.next', t('ui.tapToContinue')))));
      const show = () => {
        const l = list[i];
        const sp = speakers[l.s] || { name: l.s, color: '#fff' };
        pic.style.color = sp.color;
        pic.innerHTML = portrait(l.s, l.m, sp.color);
        who.textContent = L({ ...sp, id: 'speaker-' + l.s }, 'name');
        who.style.color = sp.color;
        txt.textContent = L(l, 't');
        this.sfx('blip', l.s === 'tobo' ? 1.5 : l.s === 'mc1' ? 0.7 : 1);
      };
      const next = () => {
        i++;
        if (i >= list.length) done();
        else show();
      };
      const done = () => {
        box.remove();
        resolve();
      };
      this.root.appendChild(box);
      show();
      box.focus();
    });
  }

  /**
   * Interactive tutorial through play: an animated hand + short tip over the
   * live game. Non-blocking; dismiss() is called by the screen when the
   * player performs the action. Shown once per mini-game unless replayed via "?".
   */
  coach(key, { x, y, text, gesture = 'tap', dx = 0, dy = 60 }, force = false) {
    if (!force && this.save.tutorialsSeen[key]) return { dismiss() {} };
    const el = h('div.coach.' + gesture, { style: { left: x + 'px', top: y + 'px', transform: 'translate(-50%, -20%)', '--dx': dx + 'px', '--dy': dy + 'px' } }, h('div.hand', '👆'), h('div.tip', text));
    this.root.appendChild(el);
    const timer = setTimeout(() => el.remove(), 20000);
    return {
      dismiss: () => {
        clearTimeout(timer);
        el.remove();
        this.save.tutorialsSeen[key] = true;
        this.persist();
      },
    };
  }

  /** Simple modal. buttons = [{label, cls, value}] → Promise(value). */
  modal(content, buttons = [{ label: t('ui.ok'), cls: 'primary', value: true }]) {
    return new Promise((resolve) => {
      const close = (v) => {
        ov.remove();
        resolve(v);
      };
      const ov = h('div.overlay.centered', { role: 'dialog', 'aria-modal': 'true' }, h('div.modal', content, h('div.row.wrap', { style: { marginTop: '14px', justifyContent: 'flex-end' } }, buttons.map((b) => h('button.btn' + (b.cls ? '.' + b.cls : ''), { onclick: () => (this.sfx('click'), close(b.value)) }, b.label)))));
      this.root.appendChild(ov);
      ov.querySelector('button')?.focus();
    });
  }

  /* ---------- lifecycle & errors ---------- */
  _installLifecycle() {
    document.addEventListener('visibilitychange', () => {
      const hidden = document.hidden;
      this.paused = hidden;
      suspendAudio(hidden);
      if (hidden) {
        this.current?.onPause?.();
        this.persist();
      } else this.current?.onResume?.();
    });
    window.addEventListener('pagehide', () => this.persist());
    const unlock = () => {
      unlockAudio();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    // Time played (per world) + gentle session nudge.
    this._sessionStart = Date.now();
    this._nudged = false;
    setInterval(() => {
      if (document.hidden) return;
      this.save.timePlayed.total += 5;
      const wid = this.current?.worldId;
      if (wid) this.save.timePlayed.perWorld[wid] = (this.save.timePlayed.perWorld[wid] || 0) + 5;
      const n = this.settings.sessionNudgeMin;
      if (n && !this._nudged && Date.now() - this._sessionStart > n * 60000) {
        this._nudged = true;
        this.toast(L({ id: 'quip-nudge', t: this.content.dialogue.quips.nudge[0] }, 't'), 6000);
      }
    }, 5000);
    window.addEventListener('error', (e) => this.report(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => this.report(e.reason));
  }
  report(err) {
    const msg = err?.stack || String(err);
    this.log.push({ at: new Date().toISOString(), msg });
    if (this.log.length > 50) this.log.shift();
    console.error('[ECHO DRIFT]', err);
  }
  showError(err) {
    clear(this.root);
    this.root.appendChild(
      h('div.screen', h('h2', t('err.title')), h('p.muted', t('err.body')), h('div.err', String(err?.message || err)), h('div.spacer'), h('button.btn.primary.block', { onclick: () => this.go('map') }, t('ui.backToMap'))),
    );
  }
}

export function createApp(root, content, screens) {
  const app = new App(root, content, screens);
  window.__ED = app; // handy for the debug menu and automated tests
  return app;
}
