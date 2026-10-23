/**
 * Placeholder art, all generated in code (vector/canvas) so it can be swapped
 * without touching game logic. See assets/manifest.json for the swap list.
 */

const MOOD_MOUTH = {
  happy: 'M30 58 Q40 68 50 58',
  excited: 'M28 56 Q40 72 52 56 Z',
  calm: 'M31 60 L49 60',
  thinking: 'M32 61 Q40 57 48 62',
  worried: 'M30 64 Q40 56 50 64',
  sad: 'M30 65 Q40 57 50 65',
  determined: 'M30 60 L50 58',
};

/** Crew portrait SVG string. */
export function portrait(who, mood = 'calm', color = '#3ff0d2') {
  const mouth = MOOD_MOUTH[mood] || MOOD_MOUTH.calm;
  const brow = mood === 'worried' || mood === 'sad' ? 'M26 34 L36 30 M44 30 L54 34' : mood === 'determined' ? 'M26 30 L36 34 M44 34 L54 30' : 'M26 32 L36 31 M44 31 L54 32';
  if (who === 'tobo')
    return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" fill="#1a1440"/><line x1="40" y1="8" x2="40" y2="18" stroke="${color}" stroke-width="3"/><circle cx="40" cy="7" r="4" fill="${color}"/><rect x="14" y="18" width="52" height="46" rx="12" fill="#3b3a6b" stroke="${color}" stroke-width="2"/><rect x="20" y="28" width="40" height="18" rx="8" fill="#0b0a20"/><circle cx="31" cy="37" r="5" fill="${color}"/><circle cx="49" cy="37" r="5" fill="${color}"/><path d="${mouth.replace(/(\d+) (\d+)/g, (m, a, b) => `${a} ${+b - 4}`)}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  if (who === 'mc1')
    return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" fill="#0f1640"/><circle cx="40" cy="40" r="22" fill="none" stroke="${color}" stroke-width="2"/><path d="M18 40 Q29 22 40 40 T62 40" stroke="${color}" stroke-width="3" fill="none"/><circle cx="40" cy="40" r="4" fill="${color}"/><text x="40" y="74" text-anchor="middle" font-size="10" fill="${color}" font-family="monospace">EARTH</text></svg>`;
  if (who === 'orrin')
    return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" fill="#1a0f30"/>${[0, 1, 2, 3, 4].map((i) => `<circle cx="${16 + i * 12}" cy="40" r="${2 + (i % 3) * 2}" fill="${color}"/>`).join('')}<path d="M10 58 H70" stroke="${color}" stroke-dasharray="4 3"/></svg>`;
  const skin = who === 'asha' ? '#c98a5e' : '#a9714e';
  const hair = who === 'asha' ? '<path d="M18 36 Q18 12 40 12 Q62 12 62 36 L62 28 Q56 18 40 18 Q24 18 18 30 Z" fill="#1b1028"/><path d="M58 30 Q66 44 60 56" stroke="#1b1028" stroke-width="6" fill="none"/>' : '<path d="M20 30 Q22 14 40 14 Q58 14 60 30 Q50 22 40 24 Q30 22 20 30" fill="#2b1a10"/>';
  const glasses = who === 'kiran' ? '<circle cx="31" cy="42" r="7" fill="none" stroke="#ddd" stroke-width="2"/><circle cx="49" cy="42" r="7" fill="none" stroke="#ddd" stroke-width="2"/><line x1="38" y1="42" x2="42" y2="42" stroke="#ddd" stroke-width="2"/>' : '';
  return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" fill="#1a1440"/><path d="M14 80 Q14 64 40 64 Q66 64 66 80" fill="${color}" opacity=".8"/><ellipse cx="40" cy="42" rx="21" ry="24" fill="${skin}"/>${hair}<path d="${brow}" stroke="#1b1028" stroke-width="2.5" stroke-linecap="round"/><circle cx="31" cy="42" r="2.6" fill="#120a14"/><circle cx="49" cy="42" r="2.6" fill="#120a14"/>${glasses}<path d="${mouth}" stroke="#5a1f1f" stroke-width="2.5" fill="${mood === 'excited' ? '#5a1f1f' : 'none'}" stroke-linecap="round"/></svg>`;
}

/** Draw a glowing planet/star/moon on a 2D canvas context. */
export function drawBody(ctx, x, y, r, color, kind = 'planet', glow = true) {
  if (kind === 'blackhole') {
    const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 3.2);
    g.addColorStop(0, 'rgba(255,170,60,0.9)');
    g.addColorStop(0.35, 'rgba(255,90,40,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,120,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    return;
  }
  if (glow) {
    const gl = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * (kind === 'star' ? 3.5 : 1.8));
    gl.addColorStop(0, hexA(color, kind === 'star' ? 0.6 : 0.35));
    gl.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(x, y, r * (kind === 'star' ? 3.5 : 1.8), 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, kind === 'star' ? '#fffbe8' : lighten(color, 0.45));
  g.addColorStop(0.7, color);
  g.addColorStop(1, kind === 'star' ? color : darken(color, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mix(hex, t, to) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
  return `rgb(${c.join(',')})`;
}
export const lighten = (hex, t) => mix(hex, t, 255);
export const darken = (hex, t) => mix(hex, t, 0);

/** Parallax star field. Returns {draw(ctx,w,h,t,ox,oy)}. Deterministic. */
export function starField(count = 160, seed = 3) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: count }, () => ({ x: rnd(), y: rnd(), z: 0.2 + rnd() * 0.8, tw: rnd() * 6 }));
  return {
    draw(ctx, w, h, t = 0, ox = 0, oy = 0, parallax = true) {
      for (const st of stars) {
        const px = (((st.x * w - (parallax ? ox * st.z * 0.15 : 0)) % w) + w) % w;
        const py = (((st.y * h - (parallax ? oy * st.z * 0.15 : 0)) % h) + h) % h;
        const a = 0.35 + 0.65 * st.z * (0.75 + 0.25 * Math.sin(t * 2 + st.tw));
        ctx.fillStyle = `rgba(220,225,255,${a})`;
        ctx.fillRect(px, py, st.z * 1.8, st.z * 1.8);
      }
    },
  };
}

/** Orrin glyph for a number: 'dots' = n dots in a grid, 'binary' = bars (1) and rings (0). */
export function glyphSVG(n, style = 'dots', color = '#c9a7ff') {
  if (style === 'binary') {
    const bits = n.toString(2).split('');
    const w = bits.length * 14 + 6;
    return `<svg viewBox="0 0 ${w} 34" width="${w}" height="34" role="img" aria-label="${n}">${bits
      .map((b, i) => (b === '1' ? `<rect x="${6 + i * 14}" y="5" width="6" height="24" rx="3" fill="${color}"/>` : `<circle cx="${9 + i * 14}" cy="17" r="4" fill="none" stroke="${color}" stroke-width="2"/>`))
      .join('')}</svg>`;
  }
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const sz = 9;
  let out = `<svg viewBox="0 0 ${cols * sz + 4} ${rows * sz + 4}" width="${Math.max(30, cols * sz + 4)}" height="${Math.max(30, rows * sz + 4)}" role="img" aria-label="${n}">`;
  for (let i = 0; i < n; i++) out += `<circle cx="${2 + sz / 2 + (i % cols) * sz}" cy="${2 + sz / 2 + Math.floor(i / cols) * sz}" r="3.2" fill="${color}"/>`;
  return out + '</svg>';
}

/** Side-view surface scene SVG for INVESTIGATE (drawn from JSON features). */
export function sceneSVG(scene) {
  const W = 400;
  const H = 300;
  const gy = 205;
  let feats = '';
  for (const f of scene.features || []) {
    const cx = f.x * W;
    const fw = f.w * W;
    switch (f.type) {
      case 'crater':
        feats += `<path d="M${cx - fw / 2} ${gy} Q${cx} ${gy + fw * 0.35} ${cx + fw / 2} ${gy}" fill="${darken(scene.ground, 0.4)}"/><path d="M${cx - fw / 2 - 10} ${gy} Q${cx - fw / 2} ${gy - 12} ${cx - fw / 2 + 6} ${gy}" fill="${lighten(scene.ground, 0.15)}"/><path d="M${cx + fw / 2 - 6} ${gy} Q${cx + fw / 2} ${gy - 12} ${cx + fw / 2 + 10} ${gy}" fill="${lighten(scene.ground, 0.15)}"/>`;
        break;
      case 'cliff':
        for (let i = 0; i < 5; i++) feats += `<rect x="${cx - fw / 2}" y="${gy - 90 + i * 18}" width="${fw}" height="18" fill="${i === 2 ? '#1b1214' : mix(scene.ground, i * 0.08, 255)}"/>`;
        break;
      case 'vent':
        feats += `<rect x="${cx - 6}" y="${gy - 14}" width="12" height="14" fill="${darken(scene.ground, 0.3)}"/><path d="M${cx} ${gy - 16} q-8 -16 0 -30 q8 -14 0 -28" stroke="rgba(255,255,255,.35)" stroke-width="4" fill="none"/>`;
        break;
      case 'ruin':
        feats += `<path d="M${cx - fw / 2} ${gy} V${gy - 40} H${cx - fw / 4} V${gy - 60} H${cx} V${gy - 30} H${cx + fw / 4} V${gy - 50} H${cx + fw / 2} V${gy} Z" fill="#2a2440" stroke="#8f7bff" stroke-width="1.5"/><circle cx="${cx - fw / 8}" cy="${gy - 46}" r="3" fill="#ffc04d"/>`;
        break;
      case 'volcano':
        feats += `<path d="M${cx - fw / 2} ${gy} L${cx - 14} ${gy - 100} L${cx + 14} ${gy - 100} L${cx + fw / 2} ${gy} Z" fill="${darken(scene.ground, 0.25)}"/>`;
        break;
      case 'seabed':
        feats += `<rect x="${cx - fw / 2}" y="${gy}" width="${fw}" height="14" fill="#e9e2c8" opacity=".55"/><path d="M${cx - fw / 2} ${gy + 6} q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#bfb69a" fill="none"/>`;
        break;
      case 'clouds':
        feats += `<rect x="0" y="30" width="${W}" height="40" fill="#e8d870" opacity=".35"/><rect x="0" y="60" width="${W}" height="26" fill="#c9b84a" opacity=".3"/>`;
        break;
      case 'bigstar':
        feats += `<circle cx="${cx}" cy="70" r="${fw * 0.45}" fill="#ff6b5b" opacity=".9"/><circle cx="${cx}" cy="70" r="${fw * 0.6}" fill="#ff6b5b" opacity=".18"/>`;
        break;
      case 'dome':
        feats += `<path d="M${cx - fw / 2} ${gy} A${fw / 2} ${fw / 2.4} 0 0 1 ${cx + fw / 2} ${gy} Z" fill="rgba(143,123,255,.25)" stroke="#8f7bff" stroke-width="2"/><path d="M${cx - fw / 4} ${gy - fw / 4} l${fw / 2} ${fw / 8}" stroke="#8f7bff" opacity=".6"/>`;
        break;
      case 'tubes':
        feats += `<ellipse cx="${cx}" cy="${gy + 4}" rx="${fw / 2}" ry="12" fill="#120f22"/>`;
        break;
      default:
        break;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${darken(scene.sky, 0.5)}"/><stop offset="1" stop-color="${scene.sky}"/></linearGradient>
    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${scene.ground}"/><stop offset="1" stop-color="${darken(scene.ground, 0.6)}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 137) % W}" cy="${(i * 53) % 120}" r="${(i % 3) * 0.5 + 0.5}" fill="#fff" opacity=".5"/>`).join('')}
    <path d="M0 ${gy} Q100 ${gy - 12} 200 ${gy} T400 ${gy} V${H} H0 Z" fill="url(#gr)"/>
    ${feats}
  </svg>`;
}
