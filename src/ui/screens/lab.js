/** Discovery labs: real data and the real formulas the discoverers used. */
import { h, clear, put, fitCanvas } from '../dom.js';
import { jupiterMoonsSky } from '../../core/ephem.js';
import { keplerMass, rvMinMass, chirpFrequency, chirpMassOf } from '../../core/labs.js';
import { G, C, MSUN, MJUP, DAY, PC, LY } from '../../core/constants.js';
import { sci } from '../fmt.js';
import { LABS } from './home.js';

export function labScreen(app, { id }) {
  const meta = LABS.find((l) => l.id === id);
  const body = h('div.col');
  const el = h('div.screen', h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', meta.title)), h('div.label', meta.who), body);
  const labs = { galileo, exoplanet, gw, blackhole };
  let cleanup = () => {};
  const finish = async (title, lines, real) => {
    app.save.labs[id] = true;
    app.persist();
    app.beep(523, 0.15);
    setTimeout(() => app.beep(784, 0.25), 160);
    await app.modal(h('div', h('h2.ok', title), lines.map((l) => h('p', l)), h('p.small.muted', real)), [{ label: 'Back to missions', cls: 'primary', value: 1 }]);
    app.go('home');
  };

  /* ------------------------------------------------------------------ */
  function galileo() {
    // Io's real east–west offset from Jupiter, hour by hour, from 7 Jan 1610 (Galileo's first night)
    const t0 = Date.parse('1610-01-07T18:00:00Z');
    const hours = 120;
    const samples = [];
    for (let i = 0; i <= hours * 2; i++) samples.push(jupiterMoonsSky(new Date(t0 + i * 1800e3)).Io.east);
    const marks = [];
    let cursor = 24;
    const canvas = h('canvas.chart', { role: 'img', 'aria-label': 'Io east–west position over 5 days' });
    const res = h('div.panel');
    const slider = h('input', { type: 'range', min: 0, max: hours, step: 0.5, value: cursor, style: { width: '100%' }, 'aria-label': 'Time cursor' });
    slider.oninput = () => ((cursor = +slider.value), draw());
    function draw() {
      const { w, h: H, ctx } = fitCanvas(canvas);
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, w, H);
      const X = (t) => 30 + (t / hours) * (w - 40);
      const Y = (v) => H / 2 - (v / 7) * (H / 2 - 12);
      ctx.strokeStyle = '#1f2c45';
      ctx.beginPath();
      ctx.moveTo(30, H / 2);
      ctx.lineTo(w, H / 2);
      ctx.stroke();
      ctx.fillStyle = '#8d9cb5';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText('east', 2, 14);
      ctx.fillText('west', 2, H - 4);
      for (let d = 0; d <= 5; d++) ctx.fillText(`day ${d}`, X(d * 24) - 8, H - 4);
      ctx.strokeStyle = '#ffcc4d';
      ctx.beginPath();
      samples.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](X(i / 2), Y(v)));
      ctx.stroke();
      // Jupiter (telescope view) at cursor
      const now = jupiterMoonsSky(new Date(t0 + cursor * 3600e3));
      const vx = w / 2, vy = 26;
      ctx.fillStyle = '#e9d8b8';
      ctx.beginPath();
      ctx.arc(vx, vy, 6, 0, Math.PI * 2);
      ctx.fill();
      for (const [n, p] of Object.entries(now)) {
        ctx.fillStyle = n === 'Io' ? '#ffcc4d' : '#c9d4e6';
        ctx.beginPath();
        ctx.arc(vx - p.east * 6, vy - p.north * 6, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffcc4d';
      ctx.fillText('Io', vx - now.Io.east * 6 - 4, vy + 14);
      ctx.strokeStyle = '#4cc9f0';
      ctx.beginPath();
      ctx.moveTo(X(cursor), 40);
      ctx.lineTo(X(cursor), H - 14);
      ctx.stroke();
      marks.forEach((m) => {
        ctx.fillStyle = '#52d273';
        ctx.beginPath();
        ctx.arc(X(m.t), Y(m.v), 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    function mark() {
      const v = samples[Math.round(cursor * 2)];
      marks.push({ t: cursor, v });
      if (marks.length > 2) marks.shift();
      draw();
      evaluate();
    }
    function evaluate() {
      clear(res);
      if (marks.length < 2) return put(res, h('p.muted', marks.length ? 'Now mark the NEXT time Io is farthest east.' : 'Move the cursor to a moment when Io is farthest to the east (a peak), then press “Mark”.'));
      const [a, b] = [...marks].sort((x, y) => x.t - y.t);
      const T = (b.t - a.t) * 3600;
      const rRJ = (Math.abs(a.v) + Math.abs(b.v)) / 2;
      const r = rRJ * 71492e3;
      const M = keplerMass(r, T);
      const ratio = M / MJUP;
      put(
        res,
        h('div.mono', `Period T = ${(T / 3600).toFixed(1)} h · orbit r = ${rRJ.toFixed(2)} Jupiter radii = ${(r / 1e3).toFixed(0)} km`),
        h('div.mono', `M = 4π²r³ / (G T²) = ${sci(M)} kg`),
        h('p', { class: Math.abs(ratio - 1) < 0.1 ? 'ok' : 'warnc' }, Math.abs(ratio - 1) < 0.1 ? `That is ${(ratio * 100).toFixed(0)}% of Jupiter’s true mass. You weighed a planet!` : `That is ${(ratio * 100).toFixed(0)}% of Jupiter’s true mass. Check: are your two marks on two neighbouring EAST peaks?`),
        Math.abs(ratio - 1) < 0.1 ? h('button.btn.primary', { onclick: () => finish('Jupiter weighed', [`Your answer: ${sci(M)} kg.`, 'Jupiter is about 318 times as massive as Earth, and you measured it from orbits seen in a telescope.'], 'Data: real positions of Io computed for January 1610 (astronomy-engine). Galileo saw the moons but didn’t know Newton’s gravity yet; Kepler’s third law with Newton’s constant G turns his observations into a mass.') }, 'Finish lab') : null,
      );
    }
    put(body, h('p', 'On 7 January 1610 Galileo pointed his telescope at Jupiter and saw “stars” that moved with it: its moons. Here is the real motion of Io, the innermost one, hour by hour.'), h('p.small.muted', 'The farthest Io gets from Jupiter is the radius of its orbit. The time between two eastern peaks is its period. Kepler’s third law then gives Jupiter’s mass.'), canvas, slider, h('div.row', h('button.btn.primary', { onclick: mark, 'data-testid': 'mark' }, 'Mark peak'), h('button.btn', { onclick: () => ((marks.length = 0), draw(), evaluate()) }, 'Clear')), res);
    requestAnimationFrame(() => (draw(), evaluate()));
  }

  /* ------------------------------------------------------------------ */
  function exoplanet() {
    const P = 4.2307966, K = 55.77, Mstar = 1.11 * MSUN;
    let s = 42;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const obs = [];
    for (let n = 0; n < 12; n++) for (let k = 0; k < 3; k++) obs.push({ t: n + 0.2 + k * 0.12 + rnd() * 0.05, v: 0 });
    const phase0 = 0.37;
    obs.forEach((o) => (o.v = K * Math.sin((2 * Math.PI * (o.t - phase0)) / P) + gauss() * 6));
    const fit = { P: 3.0, K: 30, ph: 0 };
    const canvas = h('canvas.chart', { role: 'img', 'aria-label': 'Radial velocity of 51 Pegasi over 12 nights' });
    const res = h('div.panel');
    const mk = (label, key, min, max, step) => {
      const inp = h('input', { type: 'range', min, max, step, value: fit[key], style: { flex: 1 }, 'aria-label': label, 'data-testid': 'fit-' + key });
      inp.oninput = () => ((fit[key] = +inp.value), draw(), evaluate());
      return h('div.row', h('span.label', { style: { width: '90px' } }, label), inp);
    };
    const model = (t) => fit.K * Math.sin((2 * Math.PI * (t - fit.ph)) / fit.P);
    function draw() {
      const { w, h: H, ctx } = fitCanvas(canvas);
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, w, H);
      const X = (t) => 34 + (t / 12.5) * (w - 44);
      const Y = (v) => H / 2 - (v / 90) * (H / 2 - 10);
      ctx.strokeStyle = '#1f2c45';
      ctx.beginPath();
      ctx.moveTo(34, H / 2);
      ctx.lineTo(w, H / 2);
      ctx.stroke();
      ctx.fillStyle = '#8d9cb5';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText('+60 m/s', 0, Y(60) + 3);
      ctx.fillText('−60', 0, Y(-60) + 3);
      for (let d = 0; d <= 12; d += 2) ctx.fillText(`night ${d}`, X(d) - 10, H - 3);
      ctx.strokeStyle = '#4cc9f0';
      ctx.beginPath();
      for (let t = 0; t <= 12.5; t += 0.02) ctx[t ? 'lineTo' : 'moveTo'](X(t), Y(model(t)));
      ctx.stroke();
      ctx.fillStyle = '#ffcc4d';
      obs.forEach((o) => {
        ctx.beginPath();
        ctx.arc(X(o.t), Y(o.v), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    function evaluate() {
      const rms = Math.sqrt(obs.reduce((a, o) => a + (o.v - model(o.t)) ** 2, 0) / obs.length);
      const m = rvMinMass(fit.K, fit.P * DAY, Mstar);
      clear(res);
      const good = rms < 9;
      put(
        res,
        h('div.mono', `Fit error (RMS) = ${rms.toFixed(1)} m/s ${good ? '✓' : ''}`),
        h('div.mono', `Planet minimum mass = ${(m / MJUP).toFixed(2)} Jupiter masses · year = ${fit.P.toFixed(2)} days`),
        good ? h('p.ok', `A planet half Jupiter’s mass that orbits in ${fit.P.toFixed(1)} days, far closer to its star than Mercury is to the Sun. Astronomers didn’t think that was possible!`) : h('p.muted', 'Adjust period, wobble size and phase until the blue curve passes through the yellow measurements.'),
        good ? h('button.btn.primary', { onclick: () => finish('Exoplanet discovered', [`51 Pegasi b: about ${(m / MJUP).toFixed(2)} Jupiter masses (minimum), year of ${fit.P.toFixed(2)} days.`, 'Michel Mayor and Didier Queloz announced it on 6 October 1995 and shared the 2019 Nobel Prize in Physics.'], 'The measurements here are simulated from the real published orbit (K = 55.77 m/s, P = 4.2308 d) with realistic noise. Formula: m sin i = K · (P / 2πG)^(1/3) · M★^(2/3).') }, 'Finish lab') : null,
      );
    }
    put(body, h('p', 'A planet tugs its star in a small circle. From Earth we see the star’s light shift as it moves toward us and away: the Doppler effect. These are measurements of the star 51 Pegasi, about 50 light-years away.'), canvas, mk('Period (d)', 'P', 2, 8, 0.001), mk('Wobble (m/s)', 'K', 0, 100, 0.1), mk('Phase (d)', 'ph', 0, 8, 0.01), res);
    requestAnimationFrame(() => (draw(), evaluate()));
  }

  /* ------------------------------------------------------------------ */
  function gw() {
    const McTrue = chirpMassOf(36, 29) * MSUN;
    const fs = 4096;
    const tEnd = 0.004; // stop shortly before merger (Newtonian formula diverges)
    const span = 0.25;
    const N = Math.round(span * fs);
    const wave = (Mc) => {
      const out = new Float32Array(N);
      let ph = 0;
      for (let i = 0; i < N; i++) {
        const tau = span - i / fs + tEnd; // time before merger
        const f = chirpFrequency(tau, Mc);
        ph += (2 * Math.PI * f) / fs;
        out[i] = (f / 150) ** (2 / 3) * Math.cos(ph);
      }
      return out;
    };
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const data = wave(McTrue).map((v) => v + (rnd() - 0.5) * 0.5);
    let McMsun = 12;
    let tmpl = wave(McMsun * MSUN);
    const canvas = h('canvas.chart', { role: 'img', 'aria-label': 'Detector strain over the last quarter second before merger' });
    const res = h('div.panel');
    const inp = h('input', { type: 'range', min: 5, max: 60, step: 0.1, value: McMsun, style: { flex: 1 }, 'aria-label': 'Chirp mass in Suns', 'data-testid': 'mc' });
    inp.oninput = () => {
      McMsun = +inp.value;
      tmpl = wave(McMsun * MSUN);
      draw();
      evaluate();
    };
    const match = () => {
      let a = 0, b = 0, c = 0;
      for (let i = 0; i < N; i++) {
        a += data[i] * tmpl[i];
        b += data[i] * data[i];
        c += tmpl[i] * tmpl[i];
      }
      return a / Math.sqrt(b * c);
    };
    function draw() {
      const { w, h: H, ctx } = fitCanvas(canvas);
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, w, H);
      const X = (i) => 8 + (i / N) * (w - 16);
      const Y = (v, o) => o + -v * 30;
      ctx.strokeStyle = 'rgba(255,204,77,0.8)';
      ctx.beginPath();
      for (let i = 0; i < N; i++) ctx[i ? 'lineTo' : 'moveTo'](X(i), Y(data[i], H * 0.32));
      ctx.stroke();
      ctx.strokeStyle = '#4cc9f0';
      ctx.beginPath();
      for (let i = 0; i < N; i++) ctx[i ? 'lineTo' : 'moveTo'](X(i), Y(tmpl[i], H * 0.72));
      ctx.stroke();
      ctx.fillStyle = '#8d9cb5';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText('detector data (with noise)', 10, 14);
      ctx.fillText('your template', 10, H * 0.55);
      ctx.fillText('← 0.25 s before merger', 10, H - 4);
    }
    function play(which) {
      const ac = app.audioContext();
      if (!ac) return app.toast('Audio is not available here.');
      const src = which === 'data' ? data : tmpl;
      const buf = ac.createBuffer(1, src.length * 3, fs);
      const ch = buf.getChannelData(0);
      for (let r = 0; r < 3; r++) for (let i = 0; i < src.length; i++) ch[r * src.length + i] = src[i] * 0.25;
      const node = ac.createBufferSource();
      node.buffer = buf;
      node.connect(ac.destination);
      node.start();
    }
    function evaluate() {
      const mt = match();
      clear(res);
      const good = mt > 0.8;
      put(
        res,
        h('div.mono', `Match = ${(mt * 100).toFixed(0)}% · chirp mass = ${McMsun.toFixed(1)} Suns`),
        good ? h('p.ok', `For two equal black holes that means about ${(McMsun / chirpMassOf(1, 1)).toFixed(0)} Suns each, and about 3 Suns of mass turned into pure gravitational-wave energy.`) : h('p.muted', 'Move the slider until your template rises in pitch (“chirps”) exactly like the data.'),
        good ? h('button.btn.primary', { onclick: () => finish('Black holes weighed', [`Chirp mass ≈ ${McMsun.toFixed(0)} Suns. LIGO measured black holes of about 36 and 29 Suns, 1.3 billion light-years away.`, 'The waves stretched the 4 km LIGO arms by less than a thousandth of the width of a proton.'], 'The waveform is the leading-order (Newtonian) chirp f(τ) = (1/8π)(5/τ)^(3/8)(GMc/c³)^(−5/8), using GW150914’s real chirp mass. The true signal also includes the merger and ringdown.') }, 'Finish lab') : null,
      );
    }
    put(body, h('p', 'On 14 September 2015 both LIGO detectors felt a tiny ripple in space itself: two black holes spiralling together. As they get closer they orbit faster, so the waves “chirp” up in pitch. How fast the pitch rises tells you their mass.'), canvas, h('div.row', h('span.label', 'Chirp mass'), inp), h('div.row', h('button.btn', { onclick: () => play('data') }, '🔊 Data'), h('button.btn', { onclick: () => play('tmpl') }, '🔊 Template')), res);
    requestAnimationFrame(() => (draw(), evaluate()));
  }

  /* ------------------------------------------------------------------ */
  function blackhole() {
    const D = 16.8e6 * PC;
    const fov = 120; // µas across the image
    const ringD = 42;
    const cal = [-30, 30]; // caliper positions (µas from centre)
    let drag = -1;
    const canvas = h('canvas.chart', { style: { height: '300px' }, role: 'img', 'aria-label': 'Image of the ring around M87*' });
    const res = h('div.panel');
    // pre-render the ring
    const img = document.createElement('canvas');
    img.width = img.height = 256;
    {
      const x = img.getContext('2d');
      const id2 = x.createImageData(256, 256);
      for (let j = 0; j < 256; j++)
        for (let i = 0; i < 256; i++) {
          const u = ((i - 128) / 256) * fov, v = ((j - 128) / 256) * fov;
          const r = Math.hypot(u, v), ang = Math.atan2(v, u);
          const ring = Math.exp(-(((r - ringD / 2) / 4.2) ** 2));
          const bright = 0.55 + 0.45 * Math.sin(ang + 0.6); // brighter at the bottom, like the real image
          const val = ring * bright;
          const k = (j * 256 + i) * 4;
          id2.data[k] = 255 * Math.min(1, val * 1.25);
          id2.data[k + 1] = 150 * val;
          id2.data[k + 2] = 30 * val;
          id2.data[k + 3] = 255;
        }
      x.putImageData(id2, 0, 0);
    }
    function geo() {
      const { width: w, height: H } = canvas.getBoundingClientRect();
      const size = Math.min(w, H) - 20;
      return { size, ox: (w - size) / 2, oy: (H - size) / 2, px: size / fov };
    }
    function draw() {
      const { w, h: H, ctx } = fitCanvas(canvas);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, H);
      const g = geo();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, g.ox, g.oy, g.size, g.size);
      const cxp = g.ox + g.size / 2, cyp = g.oy + g.size / 2;
      ctx.strokeStyle = '#4cc9f0';
      ctx.lineWidth = 2;
      for (const c of cal) {
        ctx.beginPath();
        ctx.moveTo(cxp + c * g.px, g.oy);
        ctx.lineTo(cxp + c * g.px, g.oy + g.size);
        ctx.stroke();
      }
      ctx.fillStyle = '#8d9cb5';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(`image width ${fov} µas`, g.ox + 4, g.oy + g.size - 4);
      ctx.strokeStyle = '#8d9cb5';
      ctx.beginPath();
      ctx.moveTo(g.ox + g.size - 4 - 20 * g.px, g.oy + 12);
      ctx.lineTo(g.ox + g.size - 4, g.oy + 12);
      ctx.stroke();
      ctx.fillText('20 µas', g.ox + g.size - 4 - 20 * g.px, g.oy + 24);
    }
    canvas.addEventListener('pointerdown', (e) => {
      const g = geo();
      const r = canvas.getBoundingClientRect();
      const u = (e.clientX - r.left - g.ox - g.size / 2) / g.px;
      drag = Math.abs(u - cal[0]) < Math.abs(u - cal[1]) ? 0 : 1;
      cal[drag] = u;
      canvas.setPointerCapture?.(e.pointerId);
      draw();
      evaluate();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const g = geo();
      const r = canvas.getBoundingClientRect();
      cal[drag] = Math.max(-fov / 2, Math.min(fov / 2, (e.clientX - r.left - g.ox - g.size / 2) / g.px));
      draw();
      evaluate();
    });
    canvas.addEventListener('pointerup', () => (drag = -1));
    const nudge = (i, d) => () => ((cal[i] += d), draw(), evaluate());
    function evaluate() {
      const theta = Math.abs(cal[1] - cal[0]);
      const rad = (theta * 1e-6 * Math.PI) / (180 * 3600);
      const M = (rad * D * C * C) / (11 * G);
      const ratio = M / (6.5e9 * MSUN);
      clear(res);
      const good = Math.abs(theta - ringD) < 3;
      put(
        res,
        h('div.mono', `Ring diameter θ = ${theta.toFixed(1)} µas (micro-arcseconds)`),
        h('div.mono', `M = θ · D · c² / (11 G) = ${sci(M / MSUN)} Suns`),
        good ? h('p.ok', `About ${(M / MSUN / 1e9).toFixed(1)} billion times the mass of the Sun, packed into a region smaller than our Solar System.`) : h('p.muted', 'Drag the two blue lines (or use the buttons) onto the brightest part of the ring on each side.'),
        good ? h('button.btn.primary', { onclick: () => finish('Black hole weighed', [`M87* ≈ ${(M / MSUN / 1e9).toFixed(1)} billion Suns (EHT: 6.5 ± 0.7 billion).`, 'The image was made by linking radio telescopes across Earth into one Earth-sized virtual telescope.'], `Distance used: 16.8 Mpc (${(D / LY / 1e6).toFixed(0)} million light-years). The EHT found the ring is about 11 gravitational radii across (GM/c² per unit distance). The ring image here is a simplified model with the published size.`) }, 'Finish lab') : null,
      );
    }
    put(
      body,
      h('p', 'In April 2019 the Event Horizon Telescope showed the first image of a black hole’s shadow, in the galaxy M87, 55 million light-years away. Light bends around the black hole and forms a ring. Its size tells us the mass.'),
      canvas,
      h('div.row.wrap', h('button.btn.sm', { onclick: nudge(0, -0.5) }, '◀ left'), h('button.btn.sm', { onclick: nudge(0, 0.5) }, 'left ▶'), h('div.spacer'), h('button.btn.sm', { onclick: nudge(1, -0.5) }, '◀ right'), h('button.btn.sm', { onclick: nudge(1, 0.5) }, 'right ▶')),
      res,
    );
    requestAnimationFrame(() => (draw(), evaluate()));
  }

  labs[id]();
  return { el, destroy: () => cleanup() };
}
export { MJUP };
