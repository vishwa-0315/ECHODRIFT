/**
 * Profile and certificates. The player's details (kept only on this device)
 * appear on certificates unlocked by levels completed and stars earned.
 * Certificates are issued by Launch Window and signed by Vyom; the footer
 * states the game's YASSC 2026 selection as a fact about the game.
 */
import { h, clear, put } from '../dom.js';
import { progress, CERTS, rankFor } from '../../game/progress.js';
import { LEVELS } from '../../arcade/levels.js';
import { vyomSVG, vyomNote } from '../guide.js';
import { sfx } from '../audio.js';

const FOOTER = 'Launch Window was selected for the State-Level Youth Astronomy & Space Science Congress (YASSC 2026), organised by the Tamilnadu Astronomy & Science Society (TASS).';

/** Profile form. onSaved(profile) runs after a valid save. */
export function profileForm(app, onSaved) {
  const prog = progress(app);
  const pf = prog.profile();
  const field = (key, label, ph, required = false) => {
    const inp = h('input.pf-input', { type: 'text', value: pf[key] || '', placeholder: ph, maxlength: 60, autocomplete: 'off', 'data-testid': 'pf-' + key, 'aria-label': label });
    return { key, inp, el: h('label.pf-field', h('span.pf-label', label + (required ? ' *' : '')), inp) };
  };
  const F = [field('name', 'Your name', 'As it should appear on the certificate', true), field('school', 'School or college', 'e.g. K. Ramakrishnan College of Technology'), field('grade', 'Class or year', 'e.g. Class 8, or III BE (ECE)'), field('city', 'City or district', 'e.g. Tiruchirappalli')];
  const err = h('div.pf-err', { role: 'alert' });
  const form = h(
    'form.pf-form',
    {
      onsubmit: (e) => {
        e.preventDefault();
        const vals = Object.fromEntries(F.map((f) => [f.key, f.inp.value.replace(/\s+/g, ' ').trim()]));
        if (vals.name.length < 2) {
          err.textContent = 'Please type your name (at least 2 letters).';
          F[0].inp.focus();
          return;
        }
        prog.setProfile(vals);
        sfx.tap();
        onSaved?.(vals);
      },
    },
    F.map((f) => f.el),
    err,
    h('p.small.muted', 'Saved only on this device, and printed on your certificates. Nothing is sent anywhere.'),
    h('button.btn.primary.block', { type: 'submit', 'data-testid': 'pf-save' }, 'Save profile'),
  );
  return form;
}

/** Draw a certificate on a canvas (1600 × 1130 px, landscape). */
export async function drawCertificate(canvas, cert, info) {
  const W = 1600, H = 1130;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // paper and borders
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fffaf0');
  bg.addColorStop(1, '#f4ecdc');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#0b1a33';
  ctx.lineWidth = 14;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.strokeStyle = cert.color;
  ctx.lineWidth = 5;
  ctx.strokeRect(56, 56, W - 112, H - 112);
  // faint orbit rings in the corners
  ctx.strokeStyle = 'rgba(11,26,51,0.07)';
  ctx.lineWidth = 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(62, 62, W - 124, H - 124);
  ctx.clip();
  for (const [cx, cy] of [[110, 110], [W - 110, H - 110]]) for (const r of [70, 120, 170]) ((ctx.beginPath(), ctx.arc(cx, cy, r, 0, Math.PI * 2), ctx.stroke()));
  ctx.restore();
  const centre = (text, y, font, color = '#0b1a33') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, y);
  };
  const fit = (text, maxW, size, weight = '700', family = 'Georgia, "Times New Roman", serif') => {
    let s = size;
    ctx.font = `${weight} ${s}px ${family}`;
    while (ctx.measureText(text).width > maxW && s > 18) ctx.font = `${weight} ${(s -= 2)}px ${family}`;
    return ctx.font;
  };
  centre('LAUNCH WINDOW', 150, '800 34px Inter, system-ui, sans-serif', '#ff9933');
  centre('Real missions · real physics', 186, 'italic 24px Georgia, serif', '#5b6b85');
  centre('CERTIFICATE OF ACHIEVEMENT', 270, '700 64px Georgia, "Times New Roman", serif');
  // tier ribbon
  ctx.fillStyle = cert.color;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 260, 300, 520, 58, 29);
  ctx.fill();
  centre(`${cert.tier.toUpperCase()} · ${cert.title.toUpperCase()}`, 340, '800 28px Inter, system-ui, sans-serif', '#ffffff');
  centre('This is to certify that', 430, 'italic 30px Georgia, serif', '#3b4a63');
  centre(info.name, 510, fit(info.name, 1100, 72), '#0b1a33');
  ctx.strokeStyle = '#c9b48a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 420, 530);
  ctx.lineTo(W / 2 + 420, 530);
  ctx.stroke();
  const from = [info.grade, info.school, info.city].filter(Boolean).join(', ');
  if (from) centre(from, 575, fit(from, 1250, 30, '400', 'Georgia, serif'), '#3b4a63');
  const body1 = `has completed ${info.levels} of ${LEVELS.length} real space missions in Launch Window,`;
  const body2 = `earning ${info.stars} of ${LEVELS.length * 3} stars and the rank of ${info.rank},`;
  const body3 = 'flying with the real laws of physics behind ISRO’s and NASA’s missions.';
  centre(body1, 650, '400 30px Georgia, serif', '#0b1a33');
  centre(body2, 692, '400 30px Georgia, serif', '#0b1a33');
  centre(body3, 734, '400 30px Georgia, serif', '#0b1a33');
  // performance row
  const stats = [[`${info.stars} ★`, 'stars'], [`${info.levels}/${LEVELS.length}`, 'missions'], [String(info.quiz), 'quiz answers right'], [`${info.cards}/${LEVELS.length}`, 'history cards']];
  stats.forEach(([v, k], i) => {
    const x = 330 + i * 313;
    ctx.textAlign = 'center';
    ctx.fillStyle = cert.color === '#9aa4b2' ? '#5f6a79' : cert.color;
    ctx.font = '800 40px Inter, system-ui, sans-serif';
    ctx.fillText(v, x, 812);
    ctx.fillStyle = '#5b6b85';
    ctx.font = '400 20px Inter, system-ui, sans-serif';
    ctx.fillText(k, x, 840);
  });
  // signatures: Vyom and the Launch Window team
  const face = new Image();
  face.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(vyomSVG('happy', 120).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  await new Promise((r) => ((face.onload = r), (face.onerror = r)));
  try {
    ctx.drawImage(face, 300, 860, 110, 110);
  } catch {
    /* the face is decoration */
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0b1a33';
  ctx.font = 'italic 34px "Brush Script MT", "Segoe Script", cursive';
  ctx.fillText('Vyom', 430, 920);
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText('Vyom, Mission Guide', 430, 952);
  ctx.textAlign = 'right';
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillText(`Awarded on ${info.date}`, W - 300, 912);
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#5b6b85';
  ctx.fillText(`Certificate no. ${info.id}`, W - 300, 944);
  ctx.fillText('Launch Window game', W - 300, 970);
  // the fixed footer line about the game's YASSC 2026 selection
  ctx.textAlign = 'center';
  ctx.fillStyle = '#3b4a63';
  ctx.font = '600 19px Inter, system-ui, sans-serif';
  const words = FOOTER.split(' ');
  let line = '', y = 1030;
  const lines = [];
  for (const wd of words) {
    if (ctx.measureText(line + wd).width > W - 260) ((lines.push(line.trim()), (line = '')));
    line += wd + ' ';
  }
  lines.push(line.trim());
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 26));
  ctx.textAlign = 'left';
}

function certInfo(app, cert) {
  const prog = progress(app);
  const pf = prog.profile();
  const total = prog.total();
  const when = new Date(prog.certEarned(cert.id) || Date.now());
  let hs = 0;
  for (const c of `${pf.name}|${cert.id}|${when.getTime()}`) hs = (hs * 33 + c.charCodeAt(0)) >>> 0;
  return {
    name: pf.name,
    school: pf.school,
    grade: pf.grade,
    city: pf.city,
    levels: prog.levelsDone(),
    stars: total,
    rank: rankFor(total).name,
    quiz: prog.data.quizRight || 0,
    cards: prog.cardCount(),
    date: when.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    id: `LW-${cert.id.slice(0, 2).toUpperCase()}-${hs.toString(36).toUpperCase().slice(0, 6)}`,
  };
}

/** Save the picture: share sheet where available, otherwise a download. */
async function saveImage(app, canvas, name) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], name, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'My Launch Window certificate' });
  } catch {
    /* fall through to a download */
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  app.toast('Certificate saved to your downloads.', 2600, 'happy');
}

export function certsScreen(app) {
  const prog = progress(app);
  const body = h('div.certs-body');
  const el = h('div.screen', h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', 'Profile & certificates')), body);

  function show(cert) {
    const canvas = h('canvas.cert-canvas', { role: 'img', 'aria-label': `${cert.tier} certificate for ${prog.profile().name}` });
    const ov = h(
      'div.overlay.cert-ov',
      { role: 'dialog', 'aria-modal': 'true', onclick: (e) => e.target === ov && ov.remove() },
      h(
        'div.modal.cert-modal',
        canvas,
        h('div.row.wrap.result-btns', h('button.btn', { onclick: () => ov.remove() }, 'Close'), h('button.btn.primary.grow', { 'data-testid': 'cert-save', onclick: () => saveImage(app, canvas, `LaunchWindow-${cert.tier}-certificate.png`) }, 'Save or share')),
      ),
    );
    el.appendChild(ov);
    drawCertificate(canvas, cert, certInfo(app, cert));
  }

  function render() {
    clear(body);
    const pf = prog.profile();
    const done = prog.levelsDone(), stars = prog.total();
    if (!pf.name) {
      put(body, vyomNote('Tell me a little about you, so I can put your name on your certificates!', 'happy'), profileForm(app, () => render()));
      return;
    }
    put(
      body,
      h(
        'div.pf-card',
        h('div', h('b', pf.name), h('div.small.muted', [pf.grade, pf.school, pf.city].filter(Boolean).join(' · ') || 'Add your school and city')),
        h('button.btn.sm', { 'data-testid': 'pf-edit', onclick: () => (clear(body), put(body, profileForm(app, () => render())), sfx.tap()) }, 'Edit'),
      ),
      vyomNote(`You have completed ${done} of ${LEVELS.length} missions with ${stars} stars. Keep flying to unlock every certificate!`, 'happy'),
      h(
        'div.cert-grid',
        CERTS.map((c) => {
          const got = prog.certEarned(c.id);
          const need = [];
          if (done < c.levels) need.push(`${c.levels - done} more missions`);
          if (stars < c.stars) need.push(`${c.stars - stars} more stars`);
          return h(
            'button.cert-card' + (got ? '.got' : ''),
            { disabled: !got, 'data-testid': 'cert-' + c.id, style: { '--tier': c.color }, onclick: () => (sfx.unlock(), show(c)) },
            h('span.medal', { style: { background: c.color } }, '★'),
            h('div', h('b', `${c.tier} · ${c.title}`), h('div.small.muted', `Complete ${c.levels === LEVELS.length ? 'all' : c.levels} missions${c.stars ? ` with ${c.stars}+ stars` : ''}`), h('div.small', got ? 'Unlocked: tap to view and save' : `Locked: ${need.join(' and ')}`)),
          );
        }),
      ),
      h('p.small.muted', FOOTER),
    );
  }
  render();
  return { el };
}
