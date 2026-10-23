/** How the physics works, honest simplifications, sources and credits. */
import { h } from '../dom.js';
import { VERSION } from '../app.js';

export function aboutScreen(app) {
  const sec = (t, ...c) => h('div', { style: { marginBottom: '14px' } }, h('h3', t), ...c);
  const el = h(
    'div.screen',
    h('div.topbar', h('button.btn.icon.ghost', { 'aria-label': 'Back', onclick: () => app.go('home') }, '←'), h('h2', 'How the physics works')),
    sec('Quick play', h('p', 'The eight quick levels use exactly the same laws: Newton’s gravity from every body in the level, real engine thrust and real fuel use (the rocket equation). Only two things are made friendlier. The clock speeds up far from planets and slows down near them, where the action is. Each level starts at a moment chosen to keep it short. A test plays every level with the real physics and checks it can be won.'), h('ul.small', h('li', 'Planets and moons move on circular orbits with their real size and period.'), h('li', 'Landers come straight down (sideways steering is left to the onboard computer).'), h('li', 'On the Mars launch-window and slingshot levels, only the Sun (and Jupiter and Saturn) pull on the spacecraft during the long cruise; the other planets are too far away to matter.'))),
    sec('Gravity', h('p', 'Newton’s law of gravitation, F = G·M·m / r², from every body that matters: the Earth, Moon and Sun for lunar missions; the Sun, planets and Jupiter for interplanetary ones. Nothing is scripted: if you miss, you miss.')),
    sec('Real positions on real dates', h('p', 'Planets and the Moon are where they really were on the mission dates, computed with the open-source astronomy-engine library (VSOP87 and lunar theories, accurate to about an arcminute). A test checks Mars against NASA JPL’s published orbital elements.')),
    sec('Rocket engines', h('p', 'Every burn takes real time. Thrust pushes the spacecraft while fuel is used at ṁ = F / (Isp·g₀). The rocket equation Δv = Isp·g₀·ln(m₀/m₁) decides how far you can go. A weak 440 N engine really does lose efficiency on a 40-minute burn (gravity losses).')),
    sec('Accurate maths', h('p', 'Spacecraft are flown with an adaptive Dormand–Prince Runge–Kutta integrator (the method behind MATLAB’s ode45). It matches the exact Kepler solution to within metres, and keeps energy over 100 orbits. What the dashed prediction shows is exactly what will happen.')),
    sec('Landers and entry', h('p', 'Landers use real engine thrust, throttle limits, fuel flow and local gravity. Mars entry uses NASA Glenn’s Mars atmosphere model, real aerodynamic drag and lift, Sutton–Graves heating and the real parachute window.')),
    sec('What is simplified (honestly)', h('ul', h('li', 'The game is flat (2D): orbits are drawn in the plane of Earth’s orbit. So some burn sizes differ from the real 3D missions, and Aditya-L1’s halo orbit is shown as its planar cousin (a Lyapunov orbit) with the same 178-day period.'), h('li', 'Some spacecraft masses and engine efficiencies (Isp) are public estimates; each mission lists which.'), h('li', 'Mars’s rotation, Earth’s flattening and solar radiation pressure are not modelled.'))),
    sec('Proven playable', h('p', 'An automatic test flies every mission with the real fuel load, using only Mission Assist and the same physics you fly, and checks it succeeds. For example, Chandrayaan-3 reaches lunar orbit on 5 August 2023, the real date.')),
    sec('Credits', h('ul.small', h('li', 'Earth: NASA Blue Marble (public domain). Moon: NASA LRO / Clementine mosaic (public domain).'), h('li', 'Ephemerides: astronomy-engine by Don Cross (MIT licence).'), h('li', 'Font: Inter by Rasmus Andersson (SIL Open Font License).'), h('li', 'Mission facts: ISRO, NASA/JPL and the sources listed on each mission.'))),
    h('p.small.muted', `Launch Window v${VERSION} · offline · no ads · no data collected`),
  );
  return { el };
}
