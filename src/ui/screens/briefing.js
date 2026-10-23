/** Mission briefing: real story, real spacecraft numbers, the rocket equation. */
import { h } from '../dom.js';
import { G0 } from '../../core/constants.js';
import { kg, dv } from '../fmt.js';

export function briefingScreen(app, { id }) {
  const m = app.content.missions.find((x) => x.id === id);
  const P = m.physics;
  const ship = P.ship || P.lander || P;
  const eng = ship.engine;
  const wet = ship.wetMass ?? ship.mass ?? P.mass;
  const dry = ship.dryMass ?? P.dryMass;
  const rows = [];
  if (eng) {
    rows.push(['Engine', eng.name]);
    rows.push(['Thrust', `${(eng.thrust * (eng.maxThrottle ?? 1)).toLocaleString('en-US')} N`]);
    rows.push(['Specific impulse (Isp)', `${eng.isp} s  →  exhaust speed ${(eng.isp * G0).toFixed(0)} m/s`]);
  }
  if (wet && dry) {
    rows.push(['Mass (with fuel → empty)', `${kg(wet)} → ${kg(dry)}`]);
    rows.push(['Δv available', `${dv(eng.isp * G0 * Math.log(wet / dry))}  (rocket equation)`]);
  }
  if (P.g) rows.push(['Surface gravity', `${P.g} m/s²`]);
  if (P.limits) rows.push(['Touchdown limits', `≤ ${P.limits.vz} m/s down, ≤ ${P.limits.vx} m/s sideways`]);
  if (P.entry) rows.push(['Entry', `${(P.entry.v * 3.6).toLocaleString('en-US', { maximumFractionDigits: 0 })} km/h at ${P.entry.alt / 1000} km, ${P.entry.gammaDeg}°`]);
  const start = () => {
    app.beep(660, 0.12);
    if (m.id === 'mangalyaan') app.go('porkchop', { id });
    else if (m.kind === 'orbital') app.go('orbital', { id });
    else if (m.kind === 'edl') app.go('edl', { id });
    else app.go('lander', { id });
  };
  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', m.title)),
    h('div.row.wrap', h('span.chip.' + (m.agency.startsWith('ISRO') ? 'isro' : 'nasa'), m.agency), h('span.chip', m.date.slice(0, 10)), h('span.chip', m.crew)),
    h('div.story', { style: { marginTop: '12px' } }, m.story.map((s) => h('p', s))),
    h('div.panel', { style: { margin: '6px 0 12px', borderColor: 'var(--accent)' } }, h('div.label.accent', 'Your mission'), h('p', { style: { margin: '4px 0 0', fontSize: '1.05rem' } }, m.goal)),
    h('h3', 'The real spacecraft'),
    h('table.spec', h('tbody', rows.map(([k, v]) => h('tr', h('td', k), h('td', v))))),
    h('p.small.muted', { style: { marginTop: '10px' } }, 'Rocket equation: Δv = Isp · g₀ · ln(m_full / m_empty). The heavier you are, the less each kilogram of fuel buys.'),
    h('div.spacer'),
    h('div.row', { style: { marginTop: '12px' } }, h('button.btn.primary.grow', { onclick: start, 'data-testid': 'start' }, 'Begin mission ▸')),
  );
  return { el };
}
