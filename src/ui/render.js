/**
 * Realistic body rendering. Earth and the Moon use real imagery (NASA Blue
 * Marble, NASA LRO, both public domain), projected onto a lit sphere. Other
 * bodies get colours from real imagery, procedurally banded.
 */
import earthTex from '../../assets/earth.jpg';
import moonTex from '../../assets/moon.jpg';

const TEX = { earth: earthTex, moon: moonTex };
const COLORS = {
  sun: ['#fff6d5', '#ffcc55', '#ff9a2a'],
  mercury: ['#b5ada3', '#8a837b'],
  venus: ['#f3e3b5', '#d9b878'],
  earth: ['#5a86c9', '#2d4f8f'],
  moon: ['#c9c6c0', '#8b8984'],
  mars: ['#d98a5c', '#a24f2c', '#c2703f'],
  jupiter: ['#e9d8b8', '#c49a6c', '#a8774f', '#efe2c8'],
  saturn: ['#efdcad', '#cfb47e', '#e6d3a0'],
  uranus: ['#bfe7ef', '#94cfdc'],
  neptune: ['#6f8fe6', '#3f5cc2'],
};
export const BODY_COLOR = (b) => (COLORS[b] || ['#aaa'])[0];

const images = {};
const sphereCache = new Map();

export function loadTextures() {
  return Promise.all(
    Object.entries(TEX).map(
      ([k, src]) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const x = c.getContext('2d');
            x.drawImage(img, 0, 0);
            images[k] = { w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data };
            res();
          };
          img.onerror = () => res();
          img.src = src;
        }),
    ),
  );
}

/**
 * Pre-render a lit sphere of `body` at pixel size `size`. Light comes from
 * direction `lightAng` (radians, screen space). The texture's central meridian
 * is set by `lon0` (rotation). Cached per (body, size bucket, light bucket).
 */
function sphere(body, size, lightAng, lon0 = 0) {
  const sz = Math.max(8, Math.min(512, Math.round(size / 8) * 8));
  const la = Math.round((lightAng * 180) / Math.PI / 10) * 10;
  const lo = Math.round(((lon0 * 180) / Math.PI) / 15) * 15;
  const key = `${body}|${sz}|${la}|${lo}`;
  if (sphereCache.has(key)) return sphereCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = sz;
  const x = c.getContext('2d');
  const img = x.createImageData(sz, sz);
  const tex = images[body];
  const cols = (COLORS[body] || ['#999']).map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const L = [Math.cos((la * Math.PI) / 180), Math.sin((la * Math.PI) / 180), 0.35];
  const ln = Math.hypot(...L);
  const lonOff = (lo * Math.PI) / 180;
  const r = sz / 2;
  for (let py = 0; py < sz; py++) {
    for (let px = 0; px < sz; px++) {
      const nx = (px + 0.5 - r) / r;
      const ny = (py + 0.5 - r) / r;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const i = (py * sz + px) * 4;
      let R, G, B;
      if (body === 'sun') {
        const limb = 0.55 + 0.45 * Math.pow(nz, 0.6);
        R = 255 * limb;
        G = 230 * limb;
        B = 170 * limb;
      } else {
        // sphere point → lat/lon (y up)
        const lat = Math.asin(-ny);
        const lon = Math.atan2(nx, nz) + lonOff;
        if (tex) {
          const u = ((((lon / (2 * Math.PI) + 0.5) % 1) + 1) % 1) * (tex.w - 1);
          const v = (0.5 - lat / Math.PI) * (tex.h - 1);
          const ti = ((v | 0) * tex.w + (u | 0)) * 4;
          R = tex.data[ti];
          G = tex.data[ti + 1];
          B = tex.data[ti + 2];
        } else {
          // banded procedural colouring (gas giants have bands; rocky worlds mottled)
          if (body === 'jupiter' || body === 'saturn') {
            const band = Math.floor((lat + 1.6) * 7 + Math.sin(lon * 3) * 0.3);
            [R, G, B] = cols[((band % cols.length) + cols.length) % cols.length];
          } else {
            // rocky worlds: smooth mottling between the light and dark tones (+ Mars polar caps)
            const n = 0.5 + 0.22 * Math.sin(lon * 3 + lat * 5) + 0.14 * Math.sin(lat * 9 - lon * 2 + 1) + 0.08 * Math.sin(lon * 11 + lat * 3);
            const a = cols[0], b = cols[1] || cols[0];
            const t = Math.max(0, Math.min(1, n));
            R = a[0] * (1 - t) + b[0] * t;
            G = a[1] * (1 - t) + b[1] * t;
            B = a[2] * (1 - t) + b[2] * t;
            if (body === 'mars' && Math.abs(lat) > 1.32) R = G = B = 235;
          }
        }
        const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln);
        const lit = 0.06 + 0.94 * Math.pow(lam, 0.9);
        R *= lit;
        G *= lit;
        B *= lit;
      }
      img.data[i] = R;
      img.data[i + 1] = G;
      img.data[i + 2] = B;
      img.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  if (sphereCache.size > 120) sphereCache.delete(sphereCache.keys().next().value);
  sphereCache.set(key, c);
  return c;
}

/**
 * Draw a body at (x, y) with true pixel radius r. Tiny bodies get a minimum
 * marker size (and are flagged so the UI can say "not to scale").
 */
export function drawBody(ctx, body, x, y, r, lightAng = 0, opts = {}) {
  const minR = opts.minR ?? 3;
  const scaled = r < minR;
  const rr = Math.max(r, minR);
  if (body === 'sun') {
    const g = ctx.createRadialGradient(x, y, rr * 0.6, x, y, rr * 4);
    g.addColorStop(0, 'rgba(255,220,140,0.5)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (rr < 5) {
    ctx.fillStyle = BODY_COLOR(body);
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const s = sphere(body, rr * 2 * (opts.dpr || 1), lightAng, opts.lon0 || 0);
    ctx.drawImage(s, x - rr, y - rr, rr * 2, rr * 2);
    if (body === 'earth' || body === 'venus' || body === 'mars') {
      ctx.strokeStyle = body === 'earth' ? 'rgba(120,180,255,0.35)' : 'rgba(255,220,180,0.18)';
      ctx.lineWidth = Math.max(1, rr * 0.04);
      ctx.beginPath();
      ctx.arc(x, y, rr * 1.015, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (body === 'saturn' && rr >= 3) {
    ctx.strokeStyle = 'rgba(230,210,160,0.55)';
    ctx.lineWidth = Math.max(1, rr * 0.18);
    ctx.beginPath();
    ctx.ellipse(x, y, rr * 2.1, rr * 0.55, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  return scaled;
}

/** Deterministic star field with realistic brightness distribution. */
export function starField(n = 600, seed = 11) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const stars = Array.from({ length: n }, () => {
    const m = rnd();
    return { x: rnd(), y: rnd(), b: Math.pow(m, 6) * 0.9 + 0.08, c: rnd() < 0.15 ? '#ffd9b0' : rnd() < 0.3 ? '#cfe0ff' : '#ffffff' };
  });
  return (ctx, w, h) => {
    for (const st of stars) {
      ctx.globalAlpha = st.b;
      ctx.fillStyle = st.c;
      const sz = st.b > 0.6 ? 1.6 : 1;
      ctx.fillRect(st.x * w, st.y * h, sz, sz);
    }
    ctx.globalAlpha = 1;
  };
}
