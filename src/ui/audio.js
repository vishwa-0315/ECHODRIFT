/**
 * Procedural audio (Web Audio). No sound files to license: every effect is
 * synthesised. All sounds respect the Sound/Music settings and are optional.
 */
let ctx = null;
let master = null;
let musicGain = null;
let pad = null;
let settings = { sound: true, music: true };

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(master);
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function configureAudio(s) {
  settings = s;
  if (ctx && musicGain) musicGain.gain.setTargetAtTime(s.music && s.sound ? 0.18 : 0, ctx.currentTime, 0.4);
  if (s.music && s.sound) startPad();
}

/** Call on the first user gesture (browsers block audio before that). */
export function unlockAudio() {
  if (!ac()) return;
  configureAudio(settings);
}

function tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, slide = 0, delay = 0, echo = false }) {
  if (!settings.sound || !ac()) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  if (echo) {
    const d = ctx.createDelay();
    d.delayTime.value = 0.22;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    g.connect(d);
    d.connect(fb);
    fb.connect(d);
    d.connect(master);
  }
  o.start(t0);
  o.stop(t0 + dur + (echo ? 1.5 : 0.05));
}

function noise(dur = 0.4, vol = 0.3, lp = 1200) {
  if (!settings.sound || !ac()) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start();
}

export const sfx = {
  click: () => tone({ freq: 660, type: 'triangle', dur: 0.06, vol: 0.15 }),
  blip: (pitch = 1) => tone({ freq: 520 * pitch, type: 'square', dur: 0.04, vol: 0.05 }),
  ping: () => tone({ freq: 880, type: 'sine', dur: 0.5, vol: 0.2, echo: true }),
  burn: (power = 0.5) => noise(0.25 + power * 0.3, 0.12 + power * 0.15, 500 + power * 900),
  whoosh: () => tone({ freq: 200, type: 'sawtooth', dur: 0.6, vol: 0.08, slide: 600 }),
  success: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.18, delay: i * 0.09 })),
  fail: () => tone({ freq: 220, type: 'sawtooth', dur: 0.5, vol: 0.15, slide: -150 }),
  boom: () => noise(1.2, 0.5, 700),
  scan: () => tone({ freq: 300, type: 'sine', dur: 0.35, vol: 0.12, slide: 900 }),
  fizzle: () => {
    noise(0.6, 0.2, 3000);
    tone({ freq: 400, type: 'square', dur: 0.5, vol: 0.08, slide: -320 });
  },
  boing: () => tone({ freq: 180, type: 'sine', dur: 0.4, vol: 0.25, slide: 420 }),
  tick: () => tone({ freq: 1200, type: 'square', dur: 0.02, vol: 0.06 }),
  star: () => tone({ freq: 1320, type: 'triangle', dur: 0.18, vol: 0.15 }),
};

/** Ambient synth pad: two detuned oscillators through a slowly swept filter. */
function startPad() {
  if (pad || !ac()) return;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 600;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain);
  lfoGain.connect(f.frequency);
  const oscs = [110, 110 * 1.5, 110 * 1.005, 165 * 1.003].map((fr, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'triangle' : 'sine';
    o.frequency.value = fr;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(f);
    o.start();
    return o;
  });
  f.connect(musicGain);
  lfo.start();
  pad = { oscs, lfo };
  musicGain.gain.setTargetAtTime(settings.music && settings.sound ? 0.18 : 0, ctx.currentTime, 1);
}

/** Pause/resume all audio with the app lifecycle. */
export function suspendAudio(yes) {
  if (!ctx) return;
  if (yes) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
}
