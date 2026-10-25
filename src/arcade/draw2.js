/** Drawing for the build-8 ISRO levels (telescope, map, hazard hover, rover, L1, geostationary, glider). */
import { drawBody } from '../ui/render.js';

const D = Math.PI / 180;
const RE = 6378.137, RGEO = 42164;

/** Shared look for a small HUD-style text label with a dark halo. */
function lab(ctx, text, x, y, color = '#c9d4e6', align = 'center', size = 11) {
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(4,6,11,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

/* ---------------- AstroSat: telescope view ---------------- */
const SKY = Array.from({ length: 260 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.678;
  return { ang: ((a - Math.floor(a)) * 200 - 70) * D, y: b - Math.floor(b), m: 0.4 + ((i * 7) % 10) / 12 };
});
function astro(ctx, W, H, game, skin, view) {
  ctx.fillStyle = '#03050a';
  ctx.fillRect(0, 0, W, H);
  const cy = (view.top + view.bottom) / 2, cx = W / 2;
  const ppd = Math.min(W, H) / 36; // pixels per degree on screen
  const th = game.theta;
  for (const s of SKY) {
    const x = cx + ((s.ang - th) / D) * ppd;
    if (x < -4 || x > W + 4) continue;
    const y = view.top + 20 + s.y * (view.bottom - view.top - 40);
    ctx.fillStyle = `rgba(255,255,255,${s.m})`;
    ctx.fillRect(x, y, s.m * 2.2, s.m * 2.2);
  }
  // the target: the Crab Nebula (a glowing cloud)
  const tx = cx + ((game.target - th) / D) * ppd;
  if (tx > -60 && tx < W + 60) {
    const g = ctx.createRadialGradient(tx, cy, 2, tx, cy, 26);
    g.addColorStop(0, 'rgba(255,230,200,0.95)');
    g.addColorStop(0.35, 'rgba(255,140,120,0.55)');
    g.addColorStop(1, 'rgba(120,90,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    lab(ctx, 'Crab Nebula', tx, cy + 42, '#ffd2c2');
  } else {
    // arrow to the target, off screen
    const right = tx > cx;
    const ax = right ? W - 22 : 22;
    ctx.fillStyle = '#ffd2c2';
    ctx.beginPath();
    ctx.moveTo(ax + (right ? 12 : -12), cy);
    ctx.lineTo(ax, cy - 9);
    ctx.lineTo(ax, cy + 9);
    ctx.fill();
    lab(ctx, `Crab Nebula ${Math.abs((game.target - th) / D).toFixed(0)}°`, right ? W - 30 : 30, cy - 16, '#ffd2c2', right ? 'right' : 'left');
  }
  // telescope cross-hairs and field of view
  const r = Math.min(W, view.bottom - view.top) * 0.28;
  ctx.strokeStyle = 'rgba(76,201,240,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx - r - 12, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + r + 12, cy);
  ctx.moveTo(cx, cy - r - 12);
  ctx.lineTo(cx, cy - 8);
  ctx.moveTo(cx, cy + 8);
  ctx.lineTo(cx, cy + r + 12);
  ctx.stroke();
  lab(ctx, 'TELESCOPE VIEW', cx, cy - r - 18, '#4cc9f0');
  // capture window around the target: inside it, slow enough, the star tracker locks on
  if (tx > -100 && tx < W + 100) {
    ctx.strokeStyle = game.locked ? '#52d273' : 'rgba(82,210,115,0.7)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, cy, 2.5 * ppd, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // where you would stop if you pushed back now
  if (!game.locked && Math.abs(game.omega) > 0.02 * D && view.aids !== false) {
    const sx = cx + ((game.stopAt - th) / D) * ppd;
    if (sx > 0 && sx < W) {
      ctx.strokeStyle = '#ffcc4d';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      lab(ctx, 'stop here', sx, cy - 22, '#ffcc4d', 'center', 10);
    } else {
      const right = sx > cx;
      lab(ctx, `stop point ${right ? '→' : '←'}`, right ? W - 14 : 14, cy + 40, '#ffcc4d', right ? 'right' : 'left', 10);
    }
  }
  if (game.locked) lab(ctx, 'STAR TRACKER LOCKED', cx, cy + r + 30, '#52d273', 'center', 13);
  // reaction wheel spin indicator
  const wy = view.bottom - 24;
  lab(ctx, game.burning ? 'Reaction wheels pushing' : 'Coasting (keeps turning)', cx, wy, game.burning ? '#ffb347' : '#8d9cb5');
}

/* ---------------- NavIC: map of India with three range circles ---------------- */
const INDIA = [[37.0, 75.0], [35.6, 77.8], [32.7, 79.3], [30.4, 81.2], [28.0, 84.0], [26.6, 88.0], [27.9, 88.5], [27.1, 89.8], [26.7, 92.0], [27.9, 92.5], [29.2, 94.4], [28.1, 96.2], [27.0, 97.0], [25.5, 95.2], [23.8, 93.4], [22.1, 92.7], [24.2, 91.8], [25.2, 92.0], [25.2, 90.0], [26.0, 89.8], [25.2, 88.4], [24.2, 88.7], [22.2, 89.0], [21.6, 87.0], [20.3, 86.7], [19.2, 84.9], [17.7, 83.3], [16.3, 81.5], [15.6, 80.2], [13.5, 80.3], [12.0, 79.9], [10.3, 79.8], [9.3, 79.0], [8.1, 77.5], [8.9, 76.5], [11.0, 75.8], [12.9, 74.8], [15.5, 73.8], [18.9, 72.8], [20.9, 72.9], [22.2, 72.6], [21.0, 70.0], [22.4, 68.9], [23.6, 68.3], [24.3, 71.0], [25.4, 70.7], [27.0, 70.0], [28.0, 70.6], [30.0, 73.5], [31.6, 74.6], [32.7, 74.6], [34.5, 74.0]];
const SAT_COL = ['#ff9933', '#4cc9f0', '#52d273'];
function navic(ctx, W, H, game, skin, view) {
  ctx.fillStyle = '#061226';
  ctx.fillRect(0, 0, W, H);
  const top = view.top + 14, bot = view.bottom - 14;
  const lon0 = 64, lon1 = 100, lat0 = 4, lat1 = 38;
  const s = Math.min((W - 24) / (lon1 - lon0), (bot - top) / (lat1 - lat0));
  const ox = (W - s * (lon1 - lon0)) / 2, oy = top + (bot - top - s * (lat1 - lat0)) / 2;
  const X = (lon) => ox + (lon - lon0) * s, Y = (lat) => oy + (lat1 - lat) * s;
  game.map = {
    toXY: (lat, lon) => [X(lon), Y(lat)],
    toGeo: (x, y) => {
      const lon = lon0 + (x - ox) / s, lat = lat1 - (y - oy) / s;
      return lon < lon0 || lon > lon1 || lat < lat0 || lat > lat1 ? null : [lat, lon];
    },
  };
  // grid
  ctx.strokeStyle = 'rgba(76,201,240,0.10)';
  ctx.lineWidth = 1;
  for (let lo = 65; lo <= 100; lo += 5) {
    ctx.beginPath();
    ctx.moveTo(X(lo), Y(lat1));
    ctx.lineTo(X(lo), Y(lat0));
    ctx.stroke();
  }
  for (let la = 5; la <= 38; la += 5) {
    ctx.beginPath();
    ctx.moveTo(X(lon0), Y(la));
    ctx.lineTo(X(lon1), Y(la));
    ctx.stroke();
  }
  // India
  ctx.fillStyle = '#1b3a2a';
  ctx.strokeStyle = '#52d273';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  INDIA.forEach(([la, lo], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la))));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // range circles: every place at that straight-line distance from each satellite
  ctx.save();
  ctx.beginPath();
  ctx.rect(X(lon0), Y(lat1), (lon1 - lon0) * s, (lat1 - lat0) * s);
  ctx.clip();
  game.sats.forEach((sat, k) => {
    const cosPsi = (RE * RE + RGEO * RGEO - sat.d * sat.d) / (2 * RE * RGEO);
    const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));
    ctx.strokeStyle = SAT_COL[k];
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
      const b = i * D;
      const la = Math.asin(Math.sin(psi) * Math.cos(b)) / D;
      const lo = sat.L + Math.atan2(Math.sin(b) * Math.sin(psi), Math.cos(psi)) / D;
      i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();
  // legend: each satellite's signal time and the distance it gives (distance = speed of light × time)
  game.sats.forEach((sat, k) => {
    const ly = Y(lat0) - 14 - (2 - k) * 15;
    ctx.fillStyle = SAT_COL[k];
    ctx.fillRect(X(lon0) + 8, ly - 7, 14, 3);
    lab(ctx, `NavIC ${sat.L}°E: ${sat.ms.toFixed(2)} ms → ${Math.round(sat.d).toLocaleString('en-US')} km`, X(lon0) + 28, ly - 2, SAT_COL[k], 'left', 10);
  });
  // the guess
  if (game.pin) {
    const [px, py] = [X(game.pin[1]), Y(game.pin[0])];
    ctx.fillStyle = '#ff5c5c';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.status !== 'play') {
    const [tx, ty] = [X(game.truth[1]), Y(game.truth[0])];
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 9, 0, Math.PI * 2);
    ctx.stroke();
  }
  lab(ctx, 'Tap where all three circles meet', W / 2, Y(lat1) + 14, '#e7eef8');
}

/* ---------------- Vikram's hazard dodge: side view ---------------- */
function hazard(ctx, W, H, game, skin, view, dt, hp) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#02030a');
  sky.addColorStop(1, '#0b1020');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  hp.stars(ctx, W, H * 0.8);
  const groundY = view.bottom - 50;
  const ppm = Math.min((W - 20) / 90, (groundY - view.top - 20) / 160);
  const cx = W / 2 - game.x * ppm * 0.6; // camera follows the lander partly
  const X = (x) => cx + x * ppm;
  ctx.fillStyle = '#5d5f66';
  ctx.fillRect(0, groundY, W, H - groundY);
  // boulders everywhere except the safe spot (fixed pattern)
  ctx.fillStyle = '#80838c';
  for (let i = -80; i <= 80; i += 3.1) {
    if (Math.abs(i - game.safe) < game.safeW / 2 + 1) continue;
    const r = 1.1 + Math.abs(Math.sin(i * 3.7)) * 1.4;
    ctx.beginPath();
    ctx.ellipse(X(i), groundY, Math.max(5, r * ppm), Math.max(4, r * ppm * 0.8), 0, Math.PI, 0);
    ctx.fill();
  }
  // safe spot
  ctx.fillStyle = 'rgba(82,210,115,0.25)';
  ctx.fillRect(X(game.safe - game.safeW / 2), groundY - 3, game.safeW * ppm, 6);
  ctx.strokeStyle = '#52d273';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(X(game.safe - game.safeW / 2), groundY);
  ctx.lineTo(X(game.safe + game.safeW / 2), groundY);
  ctx.stroke();
  lab(ctx, 'SAFE', X(game.safe), groundY + 18, '#52d273');
  // height ruler
  for (let m = 25; m <= 150; m += 25) {
    const y = groundY - m * ppm;
    if (y < view.top + 10) break;
    ctx.fillStyle = 'rgba(201,212,230,0.55)';
    ctx.fillRect(8, y, 10, 1);
    lab(ctx, `${m} m`, 22, y + 4, 'rgba(201,212,230,0.7)', 'left', 10);
  }
  // lander
  const x = X(game.x), y = groundY - game.z * ppm;
  const size = Math.max(30, Math.min(48, 4 * ppm * 2));
  if (game.burning) {
    ctx.fillStyle = '#ffb347';
    const side = game.vx >= 0 ? 1 : -1;
    void side;
  }
  ctx.fillStyle = '#d8b44a';
  ctx.fillRect(x - size * 0.4, y - size * 0.35, size * 0.8, size * 0.6);
  ctx.fillStyle = skin.trim;
  ctx.fillRect(x - size * 0.4, y - size * 0.35, size * 0.8, size * 0.1);
  ctx.strokeStyle = '#c9d4e6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.35, y + size * 0.2);
  ctx.lineTo(x - size * 0.6, y + size * 0.5);
  ctx.moveTo(x + size * 0.35, y + size * 0.2);
  ctx.lineTo(x + size * 0.6, y + size * 0.5);
  ctx.stroke();
  // sideways speed arrow
  if (Math.abs(game.vx) > 0.03) {
    const len = Math.min(70, Math.abs(game.vx) * 40) * Math.sign(game.vx);
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.6);
    ctx.lineTo(x + len, y - size * 0.6);
    ctx.lineTo(x + len - 6 * Math.sign(len), y - size * 0.6 - 5);
    ctx.moveTo(x + len, y - size * 0.6);
    ctx.lineTo(x + len - 6 * Math.sign(len), y - size * 0.6 + 5);
    ctx.stroke();
  }
  // thruster puffs
  if (game.burning) hp.emit(x + (game.vx >= 0 ? -1 : 1) * size * 0.45, y - size * 0.1, game.vx >= 0 ? -1 : 1, 0, '#ffd27a', 1, 50);
  hp.drawParts(ctx, dt);
  if (game.status === 'lost') hp.boom(ctx, x, groundY - 6);
}

/* ---------------- Pragyan: top-down drive ---------------- */
function rover(ctx, W, H, game, skin, view) {
  ctx.fillStyle = '#6b6d73';
  ctx.fillRect(0, 0, W, H);
  // regolith speckle
  for (let i = 0; i < 400; i++) {
    const a = Math.sin(i * 91.7) * 1e4, b = Math.sin(i * 47.3) * 1e4;
    ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect((a - Math.floor(a)) * W, (b - Math.floor(b)) * H, 3, 3);
  }
  const top = view.top + 10, bot = view.bottom - 10;
  const s = Math.min((W - 30) / 15, (bot - top) / 19);
  const X = (x) => W / 2 + x * s, Y = (y) => bot - (y + 2) * s;
  for (const [cx, cy, r] of game.craters) {
    const g = ctx.createRadialGradient(X(cx) - r * s * 0.3, Y(cy) - r * s * 0.3, r * s * 0.2, X(cx), Y(cy), r * s);
    g.addColorStop(0, '#3f4045');
    g.addColorStop(1, '#55575d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(X(cx), Y(cy), r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8b8d93';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = '#9a9ca2';
  for (const [cx, cy, r] of game.rocks) {
    ctx.beginPath();
    ctx.arc(X(cx), Y(cy), r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // lander behind the start, and the science spot
  ctx.fillStyle = '#d8b44a';
  ctx.fillRect(X(-0.9), Y(-0.6), 1.8 * s, 1.2 * s);
  lab(ctx, 'Vikram', X(0), Y(-1.3), '#ffe6a0');
  ctx.strokeStyle = '#52d273';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(X(game.goal[0]), Y(game.goal[1]), 0.6 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  lab(ctx, 'Science spot', X(game.goal[0]), Y(game.goal[1]) - 0.8 * s, '#52d273');
  // rover
  ctx.save();
  ctx.translate(X(game.x), Y(game.y));
  ctx.rotate(-game.hd + Math.PI / 2);
  const rs = Math.max(14, 0.9 * s);
  ctx.fillStyle = '#e8e8ea';
  ctx.fillRect(-rs * 0.45, -rs * 0.5, rs * 0.9, rs);
  ctx.fillStyle = '#2f49b8';
  ctx.fillRect(-rs * 0.45, -rs * 0.5, rs * 0.9, rs * 0.35);
  ctx.fillStyle = '#222';
  for (const wy of [-0.4, 0, 0.4]) {
    ctx.fillRect(-rs * 0.62, wy * rs - rs * 0.1, rs * 0.14, rs * 0.2);
    ctx.fillRect(rs * 0.48, wy * rs - rs * 0.1, rs * 0.14, rs * 0.2);
  }
  ctx.restore();
}

/* ---------------- Aditya-L1: rotating frame around L1 ---------------- */
function l1(ctx, W, H, game, skin, view) {
  ctx.fillStyle = '#04060b';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = (view.top + view.bottom) / 2;
  const s = Math.min((W - 40) / (2 * game.box[0]), (view.bottom - view.top - 40) / (2 * game.box[1])) * 0.95;
  const X = (x) => cx + x * s, Y = (y) => cy - y * s;
  // the allowed zone
  ctx.strokeStyle = 'rgba(141,156,181,0.35)';
  ctx.setLineDash([4, 6]);
  ctx.strokeRect(X(-game.box[0]), Y(game.box[1]), 2 * game.box[0] * s, 2 * game.box[1] * s);
  ctx.setLineDash([]);
  // the reference loop
  ctx.strokeStyle = 'rgba(82,210,115,0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const [x, y] = game.ref((i / 120) * ((2 * Math.PI) / game.om));
    i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // L1
  ctx.strokeStyle = '#ffcc4d';
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx + 6, cy);
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx, cy + 6);
  ctx.stroke();
  lab(ctx, 'L1', cx + 12, cy - 6, '#ffcc4d', 'left');
  // Sun (far left) and Earth (right), off scale
  const sunG = ctx.createRadialGradient(0, cy, 4, 0, cy, 70);
  sunG.addColorStop(0, 'rgba(255,220,140,0.9)');
  sunG.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = sunG;
  ctx.beginPath();
  ctx.arc(0, cy, 70, 0, Math.PI * 2);
  ctx.fill();
  lab(ctx, '← Sun (148 million km)', 12, cy + 50, '#ffd27a', 'left', 10);
  drawBody(ctx, 'earth', W - 6, cy, 22, Math.PI, { minR: 8 });
  lab(ctx, 'Earth (1.5 million km) →', W - 12, cy + 44, '#9fd0ff', 'right', 10);
  // prediction and ship
  ctx.strokeStyle = 'rgba(223,232,255,0.8)';
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.moveTo(X(game.s[0]), Y(game.s[1]));
  for (const [x, y] of game.pred) ctx.lineTo(X(x), Y(y));
  ctx.stroke();
  ctx.setLineDash([]);
  const sx = X(game.s[0]), sy = Y(game.s[1]);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx - 5, sy - 4, 10, 8);
  ctx.fillStyle = '#2f49b8';
  ctx.fillRect(sx - 14, sy - 2, 8, 4);
  ctx.fillRect(sx + 6, sy - 2, 8, 4);
  lab(ctx, 'Aditya-L1', sx, sy - 12, '#e7eef8');
}

/* ---------------- INSAT-3DS: a stretch of the geostationary ring above India ---------------- */
function geo(ctx, W, H, game, skin, view) {
  ctx.fillStyle = '#04060b';
  ctx.fillRect(0, 0, W, H);
  // Earth's limb at the bottom, the geostationary ring as a wide arc above it
  const span = 22; // degrees of longitude across the screen
  const ppd = (W - 30) / span;
  const cx = W / 2, top = view.top + 60;
  const Rg = ppd / (Math.PI / 180); // ring radius in px so that 1° of longitude = ppd px
  const cy = top + Rg;
  const Rearth = Rg * (6378 / 42164);
  const earthTop = Math.min(view.bottom - 70, top + 170);
  drawBody(ctx, 'earth', cx, earthTop + Math.max(W * 0.9, 300), Math.max(W * 0.9, 300), -Math.PI / 2, { minR: 10 });
  void Rearth;
  lab(ctx, 'India', cx, earthTop + 26, '#e7eef8');
  const P = (lon) => {
    const a = -Math.PI / 2 + (lon - game.slot) * (Math.PI / 180);
    return [cx + Math.cos(a) * Rg, cy + Math.sin(a) * Rg];
  };
  ctx.strokeStyle = 'rgba(141,156,181,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let lon = game.slot - span; lon <= game.slot + span; lon += 0.25) {
    const [x, y] = P(lon);
    lon === game.slot - span ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let lon = Math.ceil(game.slot - span / 2); lon <= game.slot + span / 2; lon++) {
    const [x, y] = P(lon);
    const big = lon % 2 === 0;
    ctx.strokeStyle = 'rgba(201,212,230,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + (big ? 10 : 5));
    ctx.stroke();
    if (big) lab(ctx, `${lon}°E`, x, y + 22, 'rgba(201,212,230,0.8)', 'center', 10);
  }
  // the slot over India, with a line down to India
  const [sx0, sy0] = P(game.slot);
  ctx.strokeStyle = '#52d273';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx0, sy0, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx0, sy0 + 26);
  ctx.lineTo(cx, earthTop + 10);
  ctx.stroke();
  ctx.setLineDash([]);
  lab(ctx, 'Slot: 82°E', sx0, sy0 - 20, '#52d273');
  // the satellite
  const lon = Math.max(game.slot - span / 2 - 1, Math.min(game.slot + span / 2 + 1, game.lon));
  const [x, y] = P(lon);
  ctx.fillStyle = '#e8c15a';
  ctx.fillRect(x - 6, y - 6, 12, 12);
  ctx.fillStyle = '#2f49b8';
  ctx.fillRect(x - 20, y - 3, 12, 6);
  ctx.fillRect(x + 8, y - 3, 12, 6);
  // drift arrow (east = to the right)
  const d = game.drift();
  if (Math.abs(d) > 0.005) {
    const len = Math.sign(d) * Math.min(90, 14 + Math.abs(d) * 60);
    ctx.strokeStyle = d > 0 ? '#ff9933' : '#4cc9f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x + len, y - 30);
    ctx.lineTo(x + len - 7 * Math.sign(len), y - 36);
    ctx.moveTo(x + len, y - 30);
    ctx.lineTo(x + len - 7 * Math.sign(len), y - 24);
    ctx.stroke();
    lab(ctx, d > 0 ? 'drifting east' : 'drifting west', x + len / 2, y - 42, d > 0 ? '#ff9933' : '#4cc9f0');
  }
  lab(ctx, 'Geostationary ring, 35,786 km above the equator', cx, view.bottom - 12, '#8d9cb5', 'center', 10);
}

/* ---------------- Pushpak: side view of the glide ---------------- */
function glide(ctx, W, H, game, skin, view, dt, hp) {
  const k = Math.max(0, Math.min(1, game.h / 4500));
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `rgb(${40 + 20 * (1 - k)},${90 + 50 * (1 - k)},${170 + 20 * (1 - k)})`);
  sky.addColorStop(1, '#bfe0f5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const groundY = view.bottom - 40;
  // vertical scale follows the height so the flare is easy to see
  const span = Math.max(40, Math.min(5000, game.h * 1.4 + 30));
  const ppm = (groundY - view.top - 30) / span;
  const x0 = W * 0.35;
  // clouds drifting past
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 6; i++) {
    const cxl = ((i * 173 - game.x * ppm * 0.3) % (W + 200) + W + 200) % (W + 200) - 100;
    const cyl = groundY - (600 + i * 650) * ppm;
    if (cyl < view.top || cyl > groundY - 10) continue;
    ctx.beginPath();
    ctx.ellipse(cxl, cyl, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // ground and runway
  ctx.fillStyle = '#6f8f4e';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = '#444a52';
  ctx.fillRect(0, groundY, W, 10);
  ctx.fillStyle = '#ffffff';
  const off = (game.x * Math.min(ppm, 0.6)) % 60;
  for (let xx = -off; xx < W; xx += 60) ctx.fillRect(xx, groundY + 4, 26, 2);
  // height ruler
  const step = [10, 25, 50, 100, 250, 500, 1000].find((st) => st * ppm >= 34) || 1000;
  for (let m = step; groundY - m * ppm > view.top + 10; m += step) {
    const y = groundY - m * ppm;
    ctx.fillStyle = 'rgba(10,20,40,0.55)';
    ctx.fillRect(8, y, 10, 1);
    lab(ctx, `${m} m`, 22, y + 4, '#ffffff', 'left', 10);
  }
  // Pushpak (side view, nose to the right, pitched with the flight path + angle of attack)
  const y = groundY - game.h * ppm - 6;
  const pitch = game.gam + (game.cl - 0.33) * 0.35;
  ctx.save();
  ctx.translate(x0, y);
  ctx.rotate(-pitch);
  ctx.fillStyle = '#f2f4f8';
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.quadraticCurveTo(10, -9, -26, -6);
  ctx.lineTo(-30, 4);
  ctx.lineTo(18, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = skin.trim;
  ctx.beginPath();
  ctx.moveTo(-22, -5);
  ctx.lineTo(-30, -18);
  ctx.lineTo(-16, -6);
  ctx.fill();
  ctx.fillStyle = '#20252e';
  ctx.fillRect(-18, 1, 26, 3);
  ctx.restore();
  lab(ctx, `${Math.round(game.v * 3.6)} km/h${game.burning ? ' · pulling up' : ''}`, x0 + 40, y - 18, '#ffffff', 'left', 11);
  if (game.status === 'lost') hp.boom(ctx, x0, groundY - 6);
  void dt;
}

export const DRAW2 = { astro, navic, hazard, rover, l1, geo, glide };
