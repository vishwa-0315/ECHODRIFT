/**
 * Music and sound effects, synthesised live with Web Audio (no audio files).
 * Music: a gentle, upbeat pentatonic loop (pads + plucked arpeggio + soft beat).
 * All sounds respect the player's Music / Sounds switches.
 */
let ctx = null, master = null, musicGain = null, sfxGain = null;
let musicOn = true, sfxOn = true;
let musicTimer = null, step = 0, nextTime = 0, mood = 'menu';
let boost = null;

function ac() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Must be called from a user gesture once (browsers block audio until then). */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume();
  if (musicOn && !musicTimer) startMusic(mood);
}

export function setAudio({ music, sounds }) {
  if (music != null) {
    musicOn = music;
    if (!music) stopMusic();
    else if (ctx) startMusic(mood);
  }
  if (sounds != null) {
    sfxOn = sounds;
    if (!sounds) boostOff();
  }
}

function tone(freq, t, dur, { type = 'sine', vol = 0.3, attack = 0.01, out = sfxGain, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* ---------------- music ---------------- */
// C major pentatonic, four chords: C – Am – F – G (I–vi–IV–V)
const CHORDS = [
  [261.63, 329.63, 392.0],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 293.66],
];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const ARP = [0, 2, 4, 2, 3, 1, 4, 5];

function scheduleBar(t, bar) {
  const spb = mood === 'play' ? 0.33 : 0.4; // seconds per beat
  const chord = CHORDS[bar % 4];
  // soft pad
  for (const f of chord) tone(f / 2, t, spb * 4.2, { type: 'triangle', vol: 0.05, attack: 0.4, out: musicGain });
  // plucked arpeggio (8th notes)
  for (let i = 0; i < 8; i++) {
    const n = PENTA[(ARP[i] + bar) % PENTA.length];
    if (mood === 'menu' && i % 2) continue;
    tone(n, t + i * (spb / 2), 0.35, { type: 'sine', vol: 0.06, out: musicGain });
  }
  // gentle beat in play mode
  if (mood === 'play') {
    for (let b = 0; b < 4; b++) {
      const k = ctx.createOscillator(), g = ctx.createGain();
      const tt = t + b * spb;
      k.frequency.setValueAtTime(120, tt);
      k.frequency.exponentialRampToValueAtTime(45, tt + 0.12);
      g.gain.setValueAtTime(0.12, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.15);
      k.connect(g).connect(musicGain);
      k.start(tt);
      k.stop(tt + 0.2);
    }
  }
  return spb * 4;
}

export function startMusic(m = 'menu') {
  mood = m;
  if (!musicOn || !ac() || ctx.state !== 'running') return;
  if (musicTimer) return;
  nextTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    while (nextTime < ctx.currentTime + 0.6) {
      nextTime += scheduleBar(nextTime, step++);
    }
  }, 150);
}
export function setMood(m) {
  mood = m;
}
export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

/* ---------------- sound effects ---------------- */
export const sfx = {
  tap() {
    if (!sfxOn || !ac()) return;
    tone(660, ctx.currentTime, 0.06, { type: 'triangle', vol: 0.15 });
  },
  star(i = 0) {
    if (!sfxOn || !ac()) return;
    const t = ctx.currentTime;
    tone(880 * Math.pow(1.26, i), t, 0.5, { type: 'sine', vol: 0.25 });
    tone(1760 * Math.pow(1.26, i), t + 0.03, 0.4, { type: 'sine', vol: 0.08 });
  },
  win() {
    if (!sfxOn || !ac()) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.12, 0.5, { type: 'triangle', vol: 0.22 }));
    tone(1318.5, t + 0.5, 0.9, { type: 'sine', vol: 0.15 });
  },
  lose() {
    if (!sfxOn || !ac()) return;
    const t = ctx.currentTime;
    [392, 349.23, 293.66].forEach((f, i) => tone(f, t + i * 0.18, 0.45, { type: 'triangle', vol: 0.2 }));
  },
  right() {
    if (!sfxOn || !ac()) return;
    const t = ctx.currentTime;
    tone(659.25, t, 0.2, { vol: 0.22 });
    tone(987.77, t + 0.1, 0.4, { vol: 0.22 });
  },
  wrong() {
    if (!sfxOn || !ac()) return;
    tone(220, ctx.currentTime, 0.35, { type: 'square', vol: 0.06 });
  },
  unlock() {
    if (!sfxOn || !ac()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) tone(1046.5 * Math.pow(1.122, i), t + i * 0.06, 0.25, { vol: 0.1 });
  },
  chute() {
    if (!sfxOn || !ac()) return;
    noiseBurst(0.5, 900, 0.25);
  },
  crash() {
    if (!sfxOn || !ac()) return;
    noiseBurst(0.8, 300, 0.4);
  },
};

function noiseBuffer() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let nbuf = null;
function noiseBurst(dur, freq, vol) {
  nbuf ||= noiseBuffer();
  const s = ctx.createBufferSource();
  s.buffer = nbuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxGain);
  s.start(t);
  s.stop(t + dur);
}

/** Engine rumble while a button is held. */
export function boostOn() {
  if (!sfxOn || !ac() || boost) return;
  nbuf ||= noiseBuffer();
  const s = ctx.createBufferSource();
  s.buffer = nbuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.08);
  s.connect(f).connect(g).connect(sfxGain);
  s.start();
  boost = { s, g };
}
export function boostOff() {
  if (!boost || !ctx) return;
  const { s, g } = boost;
  boost = null;
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
  s.stop(ctx.currentTime + 0.2);
}
