/** Drawing for quick-play levels: realistic planets, plus flames, trails and particles. */
import { drawBody, starField } from '../ui/render.js';
import { heatFlux } from '../core/edl.js';

const LABEL = { earth: 'Earth', moon: 'Moon', mars: 'Mars', sun: 'Sun', jupiter: 'Jupiter', saturn: 'Saturn' };

export function createRenderer() {
  const stars = starField(420, 5);
  const cam = { x: 0, y: 0, s: 0 };
  const parts = [];
  let last = 0, lastKind = '';

  function emit(x, y, dirX, dirY, color, n = 2, speed = 60) {
    for (let i = 0; i < n; i++) {
      const sp = speed * (0.6 + Math.random() * 0.8);
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.5;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.25, age: 0, color });
    }
  }
  function drawParts(ctx, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5 + 3 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function rocket(ctx, x, y, ang, skin, burning, size = 13) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (burning) {
      const fl = size * (1.1 + Math.random() * 0.6);
      const g = ctx.createLinearGradient(-size * 0.6, 0, -size * 0.6 - fl, 0);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, skin.flame);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, -size * 0.28);
      ctx.lineTo(-size * 0.6 - fl, 0);
      ctx.lineTo(-size * 0.55, size * 0.28);
      ctx.fill();
    }
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.quadraticCurveTo(size * 0.3, -size * 0.42, -size * 0.6, -size * 0.32);
    ctx.lineTo(-size * 0.6, size * 0.32);
    ctx.quadraticCurveTo(size * 0.3, size * 0.42, size, 0);
    ctx.fill();
    ctx.fillStyle = skin.trim;
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, -size * 0.32);
    ctx.lineTo(-size * 0.85, -size * 0.6);
    ctx.lineTo(-size * 0.2, -size * 0.35);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, size * 0.32);
    ctx.lineTo(-size * 0.85, size * 0.6);
    ctx.lineTo(-size * 0.2, size * 0.35);
    ctx.fill();
    if (skin.trim2) {
      ctx.fillStyle = skin.trim2;
      ctx.fillRect(-size * 0.25, -size * 0.36, size * 0.18, size * 0.72);
    }
    ctx.fillStyle = '#0b1a33';
    ctx.beginPath();
    ctx.arc(size * 0.32, 0, size * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- orbital ---------------- */
  const ZOOM_R = { jupiter: 70, saturn: 60, sun: 0 };
  /** The body the ship is "at" right now (for close-ups), if any. */
  function nearBody(w, sc) {
    let best = null;
    const names = [sc.central, ...sc.bodies];
    for (const n of names) {
      const R = n === w.central.name ? w.central.R : w.body(n).R;
      const k = ZOOM_R[n] ?? 22;
      if (!k) continue;
      const b = w.bodyAt(n);
      const d = Math.hypot(w.y[0] - b.x, w.y[1] - b.y);
      if (d < k * R && (!best || d / (k * R) < best.q)) best = { name: n, x: b.x, y: b.y, R, d, q: d / (k * R) };
    }
    return best;
  }
  function fitBox(pts, aw, ah) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0)) * 0.9 };
  }
  /** Camera box around the ship and the body it is close to. */
  function closeBox(w, nb, aw, ah, fallbackSpan) {
    const sx = w.y[0], sy = w.y[1];
    if (!nb) {
      const h2 = fallbackSpan / 2;
      return fitBox([[sx - h2, sy - h2], [sx + h2, sy + h2]], aw, ah);
    }
    const span = Math.max(nb.d * 1.25, nb.R * 3.2);
    const cx = nb.x + (sx - nb.x) * 0.5, cy = nb.y + (sy - nb.y) * 0.5;
    return fitBox([[cx - span / 2, cy - span / 2], [cx + span / 2, cy + span / 2]], aw, ah);
  }
  let shake = 0;
  let insetCorner = 0;

  function orbital(ctx, W, H, game, skin, view, dt) {
    const sc = game.scene();
    const w = game.w;
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, W, H);
    stars(ctx, W, H);
    // leave room above for ring labels and below for the guide/banner
    const aw = W - 24, ah = view.bottom - view.top - 48;
    const pts = sc.focus.slice();
    if (!sc.shipHidden) pts.push([w.y[0], w.y[1]]);
    const wide = fitBox(pts, aw, ah);
    const nb = sc.shipHidden ? null : nearBody(w, sc);
    const mode = view.camMode || 'auto';
    let target = wide, inset = false;
    if (mode === 'follow' && !sc.shipHidden) target = closeBox(w, nb, aw, ah, Math.min(aw, ah) / wide.s / 6);
    else if (mode === 'auto' && nb && !sc.keepWide) target = closeBox(w, nb, aw, ah, 0);
    if (nb && target === wide) inset = true;
    if (!cam.s) Object.assign(cam, target);
    const k = Math.min(1, dt * 2.2);
    cam.x += (target.x - cam.x) * k;
    cam.y += (target.y - cam.y) * k;
    cam.s *= Math.pow(target.s / cam.s, k);
    if (game.status === 'lost' && w.status === 'hit' && shake === 0) shake = 0.6;
    let jx = 0, jy = 0;
    if (shake > 0) {
      shake = Math.max(0.0001, shake - dt);
      const m = (shake / 0.6) * 9;
      jx = (Math.random() - 0.5) * m;
      jy = (Math.random() - 0.5) * m;
    }
    const ox = W / 2 + jx, oy = (view.top + 22 + view.bottom) / 2 + jy;
    layer(ctx, game, skin, sc, cam.x, cam.y, cam.s, ox, oy, view, dt, true);
    if (inset && game.status === 'play') {
      // close-up window: the ship skimming the planet, while the main view stays wide
      const r = Math.min(74, W * 0.19);
      // put the close-up in the corner farthest from anything important on screen
      const X = (x) => ox + (x - cam.x) * cam.s, Y = (y) => oy - (y - cam.y) * cam.s;
      const keys = [[X(w.y[0]), Y(w.y[1])], [X(0), Y(0)], ...sc.bodies.map((n) => w.bodyAt(n)).map((b) => [X(b.x), Y(b.y)]), ...(sc.rings || []).map((rg) => w.bodyAt(rg.body)).map((b) => [X(b.x), Y(b.y)])];
      const corners = [[W - r - 10, view.top + r + 26], [r + 10, view.top + r + 26], [r + 10, view.bottom - r - 60], [W - r - 10, view.bottom - r - 60]];
      const ds = corners.map(([cx2, cy2]) => Math.min(...keys.map(([kx, ky]) => Math.hypot(kx - cx2, ky - cy2))));
      const best = ds.indexOf(Math.max(...ds));
      if (ds[best] > ds[insetCorner] + 60) insetCorner = best; // only move when clearly better (no flicker)
      const [ix, iy] = corners[insetCorner];
      const cb = closeBox(w, nb, r * 2, r * 2, 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ix, iy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#04060b';
      ctx.fillRect(ix - r, iy - r, r * 2, r * 2);
      layer(ctx, game, skin, sc, cb.x, cb.y, cb.s, ix, iy, view, 0, false);
      ctx.restore();
      ctx.strokeStyle = 'rgba(76,201,240,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ix, iy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#4cc9f0';
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.fillText('CLOSE-UP', ix - 22, iy + r + 12);
    }
  }

  /** Draw the whole scene with a given camera (used for the main view and the close-up). */
  function layer(ctx, game, skin, sc, camX, camY, scl, ox, oy, view, dt, main) {
    const w = game.w;
    const X = (x) => ox + (x - camX) * scl;
    const Y = (y) => oy - (y - camY) * scl;
    const light = (bx, by) => (sc.central === 'sun' ? Math.atan2(Y(0) - Y(by), X(0) - X(bx)) : Math.PI);
    for (const name of sc.showOrbit || []) {
      const b = w.body(name);
      ctx.strokeStyle = 'rgba(141,156,181,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(X(0), Y(0), b.a * scl, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (sc.angle && main) {
      const e = w.bodyAt(sc.angle.a), m = w.bodyAt(sc.angle.b);
      const ae = Math.atan2(e.y, e.x);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(82,210,115,0.8)';
      const ra = w.body(sc.angle.b).a * scl;
      const gx = X(0) + Math.cos(ae + sc.angle.ideal) * ra, gy = Y(0) - Math.sin(ae + sc.angle.ideal) * ra;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(0) + Math.cos(ae + sc.angle.ideal) * ra * 1.08, Y(0) - Math.sin(ae + sc.angle.ideal) * ra * 1.08);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#52d273';
      ctx.beginPath();
      ctx.arc(gx, gy, 9, 0, Math.PI * 2);
      ctx.stroke();
      label(ctx, 'Target', gx, gy + 24, '#52d273', true);
      ctx.strokeStyle = 'rgba(255,153,51,0.7)';
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(e.x), Y(e.y));
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(m.x), Y(m.y));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(0), Y(0), 40, -ae, -Math.atan2(m.y, m.x), true);
      ctx.stroke();
    }
    for (const r of sc.rings || []) {
      const b = w.bodyAt(r.body);
      const rr = Math.max(16, r.r * scl);
      ctx.strokeStyle = 'rgba(82,210,115,0.9)';
      ctx.fillStyle = 'rgba(82,210,115,0.08)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(X(b.x), Y(b.y), rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (main) label(ctx, r.label, X(b.x), Y(b.y) - rr - 6, '#52d273', true);
    }
    if (game.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,153,51,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      game.trail.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.lineTo(X(w.y[0]), Y(w.y[1]));
      ctx.stroke();
    }
    const pr = game.pred;
    if (pr && pr.path.length > 3 && game.status === 'play') {
      ctx.strokeStyle = 'rgba(223,232,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(X(w.y[0]), Y(w.y[1]));
      for (let i = 0; i < pr.path.length; i += 3) ctx.lineTo(X(pr.path[i]), Y(pr.path[i + 1]));
      ctx.stroke();
      ctx.setLineDash([]);
      if (pr.hit && main) {
        ctx.fillStyle = '#ff5c5c';
        ctx.font = '800 16px Inter, system-ui, sans-serif';
        ctx.fillText('✕', X(pr.hit.x) - 5, Y(pr.hit.y) + 5);
      }
    }
    const minR = sc.minR || {};
    const placed = [];
    const drawB = (name, x, y) => {
      const R = name === w.central.name ? w.central.R : w.body(name).R;
      const r = R * scl;
      drawBody(ctx, name, X(x), Y(y), r, light(x, y), { minR: minR[name] ?? 4, dpr: view.dpr });
      const rr = Math.max(r, minR[name] ?? 4);
      if (main && rr < 120) {
        // keep body labels clear of each other and of the ship
        let lx = X(x) + rr + 5, ly = Y(y) + 4;
        for (const p of placed) if (Math.abs(p[0] - lx) < 60 && Math.abs(p[1] - ly) < 14) ly += 14;
        placed.push([lx, ly]);
        label(ctx, LABEL[name] || name, lx, ly, '#c9d4e6', false);
      }
    };
    drawB(sc.central, 0, 0);
    for (const n of sc.bodies) {
      const b = w.bodyAt(n);
      drawB(n, b.x, b.y);
    }
    if (!sc.shipHidden) {
      const v = w.rel(sc.central);
      let ang = Math.atan2(-v.vy, v.vx);
      if (game.burning && w.burn?.dir === 'retro') ang += Math.PI;
      const sx = X(w.y[0]), sy = Y(w.y[1]);
      if (main) {
        if (game.burning) emit(sx - Math.cos(ang) * 10, sy - Math.sin(ang) * 10, -Math.cos(ang), -Math.sin(ang), skin.flame, 2, 70);
        drawParts(ctx, dt);
      }
      rocket(ctx, sx, sy, ang, skin, game.burning, main ? 12 : 9);
      if (game.status === 'lost' && w.status === 'hit') boom(ctx, sx, sy);
    } else if (main) drawParts(ctx, dt);
  }

  /** Text with a dark halo so it stays readable over planets and lines. */
  function label(ctx, text, x, y, color, centre) {
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    const lx = centre ? x - tw / 2 : x;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4,6,11,0.85)';
    ctx.strokeText(text, lx, y);
    ctx.fillStyle = color;
    ctx.fillText(text, lx, y);
  }

  function boom(ctx, x, y) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, 40);
    g.addColorStop(0, 'rgba(255,240,200,0.95)');
    g.addColorStop(0.4, 'rgba(255,140,40,0.7)');
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------- lander ---------------- */
  function lander(ctx, W, H, game, skin, view, dt) {
    const sc = game.scene();
    const l = game.l;
    const mars = sc.surface === 'mars';
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (mars) {
      sky.addColorStop(0, '#2b1a14');
      sky.addColorStop(1, '#b0704a');
    } else {
      sky.addColorStop(0, '#02030a');
      sky.addColorStop(1, '#0b1020');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (!mars) stars(ctx, W, H * 0.8);
    const groundY = view.bottom - 56;
    const alt = Math.max(0, l.altitude);
    const span = sc.span ?? Math.max(40, Math.min(sc.z0 * 1.15, alt * 1.5 + 25));
    const tgt = (groundY - view.top - 30) / span;
    if (!cam.s) cam.s = tgt;
    cam.s *= Math.pow(tgt / cam.s, Math.min(1, dt * 2));
    const ppm = cam.s;
    // ground with gentle hills/craters (decoration)
    ctx.fillStyle = mars ? '#8a4a2c' : '#5d5f66';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const u = (x - W / 2) / ppm;
      const hh = Math.sin(u * 0.05) * 1.5 + Math.sin(u * 0.13 + 1) * 0.8;
      ctx.lineTo(x, groundY - (Math.abs(u) < 12 ? 0 : hh * ppm * 0.6));
    }
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.fillStyle = mars ? '#a65c38' : '#7a7d85';
    ctx.fillRect(0, groundY, W, 3);
    // landing pad marker
    ctx.strokeStyle = 'rgba(82,210,115,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8 * ppm - 10, groundY + 1);
    ctx.lineTo(W / 2 + 8 * ppm + 10, groundY + 1);
    ctx.stroke();
    // lander
    const x = W / 2, y = groundY - alt * ppm;
    const size = sc.span ? Math.min(64, 4.2 * ppm * 0.35) : Math.max(30, Math.min(56, 4.2 * ppm));
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, groundY + 2, size * (0.6 + 0.4 / (1 + alt / 20)), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const thr = l.thrust() / l.engine.thrust;
    if (thr > 0) {
      const fl = size * (0.5 + thr * 1.4) * (0.85 + Math.random() * 0.3);
      const g = ctx.createLinearGradient(x, y + size * 0.4, x, y + size * 0.4 + fl);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, skin.flame);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.18, y + size * 0.4);
      ctx.lineTo(x, y + size * 0.4 + fl);
      ctx.lineTo(x + size * 0.18, y + size * 0.4);
      ctx.fill();
      if (alt < 30) emit(x + (Math.random() - 0.5) * 20, groundY - 2, Math.random() - 0.5, -0.4, mars ? '#c98a60' : '#9a9a9a', 2, 60);
    }
    drawParts(ctx, dt);
    if (sc.crane && alt < 22) {
      // sky crane: rover hangs on cables below the descent stage
      const drop = Math.min(6.4, 22 - alt) * ppm * 0.6;
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.2, y + size * 0.2);
      ctx.lineTo(x - size * 0.25, y + size * 0.2 + drop);
      ctx.moveTo(x + size * 0.2, y + size * 0.2);
      ctx.lineTo(x + size * 0.25, y + size * 0.2 + drop);
      ctx.stroke();
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(x - size * 0.35, y + size * 0.2 + drop, size * 0.7, size * 0.25);
    }
    // body
    ctx.fillStyle = mars ? '#d9dde4' : '#d8b44a';
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
    if (game.status === 'lost') boom(ctx, x, groundY - 6);
  }

  /* ---------------- Mars entry ---------------- */
  function edl(ctx, W, H, game, skin, view, dt) {
    const e = game.e;
    const k = Math.max(0, Math.min(1, 1 - e.alt / 125000));
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgb(${10 + 50 * k},${8 + 25 * k},${10 + 12 * k})`);
    sky.addColorStop(1, `rgb(${40 + 150 * k},${20 + 90 * k},${15 + 55 * k})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (k < 0.5) {
      ctx.globalAlpha = 1 - k * 2;
      stars(ctx, W, H);
      ctx.globalAlpha = 1;
    }
    // horizon rises as we descend
    const hy = view.bottom - 10 - (H * 0.5) * (1 - e.alt / 125000);
    ctx.fillStyle = '#8a4a2c';
    ctx.beginPath();
    ctx.ellipse(W / 2, hy + W * 2, W * 2.2, W * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // speed streaks
    const cx = W / 2, cy = view.top + (view.bottom - view.top) * 0.42;
    const v = e.s.v;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.min(30, v / 150); i++) {
      const sx = (Math.random() * W) | 0, sy = (Math.random() * H) | 0;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - Math.min(60, v / 60));
      ctx.stroke();
    }
    // heating glow
    const heat = heatFlux(e.atm().rho, v, 1.125);
    if (game.phase === 'entry' && heat > 1e4) {
      const g = ctx.createRadialGradient(cx, cy + 14, 4, cx, cy + 14, 70);
      g.addColorStop(0, `rgba(255,190,90,${Math.min(0.95, heat / 1.2e6)})`);
      g.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy + 14, 70, 0, Math.PI * 2);
      ctx.fill();
    }
    // parachute
    if (game.phase === 'chute' || game.phase === 'land') {
      ctx.strokeStyle = '#ddd';
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 8);
      ctx.lineTo(cx - 46, cy - 80);
      ctx.moveTo(cx + 14, cy - 8);
      ctx.lineTo(cx + 46, cy - 80);
      ctx.stroke();
      const g = ctx.createLinearGradient(cx - 60, 0, cx + 60, 0);
      g.addColorStop(0, '#f2f2f2');
      g.addColorStop(0.5, '#ff9933');
      g.addColorStop(1, '#f2f2f2');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 86, 62, 30, 0, Math.PI, 0);
      ctx.fill();
    }
    // capsule (aeroshell)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(performance.now() / 300) * 0.04);
    ctx.fillStyle = '#e9e6df';
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(14, -12);
    ctx.lineTo(26, 10);
    ctx.lineTo(-26, 10);
    ctx.fill();
    ctx.fillStyle = '#6b4a35';
    ctx.beginPath();
    ctx.ellipse(0, 12, 27, 7, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();
    void skin;
    void dt;
  }

  return {
    reset() {
      cam.s = 0;
      shake = 0;
      parts.length = 0;
    },
    draw(ctx, W, H, game, skin, view) {
      const now = performance.now();
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      const kind = game.kind === 'edl' ? (game.phase === 'land' ? 'lander' : 'edl') : game.kind;
      if (kind !== lastKind) {
        cam.s = 0;
        lastKind = kind;
      }
      if (game.kind === 'orbit') orbital(ctx, W, H, game, skin, view, dt);
      else if (game.kind === 'lander') lander(ctx, W, H, game, skin, view, dt);
      else if (game.kind === 'edl') {
        if (game.phase === 'land') lander(ctx, W, H, game.land, skin, view, dt);
        else edl(ctx, W, H, game, skin, view, dt);
      }
    },
    rocket,
  };
}
