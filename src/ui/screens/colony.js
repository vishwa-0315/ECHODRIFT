/** BUILD & SURVIVE — Colony Tycoon screen. Rules in core/colony.js. */
import { h, clear, put } from '../dom.js';
import { t, L } from '../i18n.js';
import { ColonySim, RESOURCES } from '../../core/colony.js';
import { topbar, phaseSteps } from './common.js';

const RES_ICON = { power: '⚡', water: '💧', oxygen: 'O₂', food: '🍲', morale: '🙂' };

export function colonyScreen(app, { world }) {
  const cfg = app.content.colony;
  const wcfg = cfg.worlds.find((w) => w.id === world);
  const ws = app.ws(world);
  const penalty = ws.hypothesis === 'wrong';
  let sim = new ColonySim(cfg, wcfg, { penalty });
  let selected = null;
  let speed = 1;
  let timer = null;
  let paused = false;
  let coach = null;
  const root = h('div.screen');

  // Persisted layout lets the player resume/retry with the same base.
  if (ws.colonyLayout) ws.colonyLayout.forEach((m, i) => m && sim.place(i, m));

  function render() {
    clear(root);
    const modDef = (id) => cfg.modules.find((m) => m.id === id);
    const statusLine =
      sim.status === 'planning'
        ? t('col.planning')
        : `${t('col.day', { d: Math.min(sim.day, wcfg.days), n: wcfg.days })} · ${sim.isDaylight ? '☀ ' + t('col.dayTime') : '🌙 ' + t('col.night')}`;
    const events = sim.status === 'running' ? (wcfg.events || []).filter((e) => sim.activeEvents.includes(e.id)) : [];
    const upcoming = sim.count('comms') ? (wcfg.events || []).find((e) => e.day === sim.day + 1) : null;

    const bars = h(
      'div.res',
      RESOURCES.map((r) => {
        const cap = r === 'power' ? sim.powerCap() : cfg.caps[r];
        const v = sim.res[r];
        const pct = (100 * v) / cap;
        const tr = sim.trend[r];
        const low = r !== 'power' && pct < 20;
        return h(
          'div.meter' + (low ? '.bad' : pct < 40 ? '.warn' : ''),
          { 'aria-label': t('col.resAria', { r: t('res.' + r), v: Math.round(v), cap, trend: tr > 0.01 ? t('col.rising') : tr < -0.01 ? t('col.falling') : t('col.steady') }) },
          h('span', { style: { width: '28px', textAlign: 'center' } }, RES_ICON[r]),
          h('span', { style: { width: '64px' } }, t('res.' + r)),
          h('div.track', h('div.fill', { style: { width: pct + '%' } })),
          h('span', { style: { width: '34px', textAlign: 'right' } }, Math.round(v)),
          h('span.trend', { style: { color: tr > 0.01 ? 'var(--ok)' : tr < -0.01 ? 'var(--danger)' : 'var(--muted)' } }, tr > 0.01 ? '▲' : tr < -0.01 ? '▼' : '•'),
          low ? h('span.small', { style: { color: 'var(--danger)' } }, '!') : null,
        );
      }),
    );

    const grid = h('div.cgrid', { style: { gridTemplateColumns: `repeat(${cfg.gridW}, 1fr)` }, role: 'grid', 'aria-label': t('col.grid') });
    sim.grid.forEach((m, i) => {
      const d = m && modDef(m);
      grid.appendChild(
        h(
          'button.cell' + (m ? '.filled' : '') + (m && sim.offline.has(m) ? '.offline' : ''),
          { 'data-testid': 'cell-' + i, 'aria-label': m ? `${L(d, 'name')}${sim.offline.has(m) ? ' — ' + t('col.offline') : ''}` : t('col.empty'), onclick: () => tapCell(i) },
          d ? h('span', { 'aria-hidden': 'true' }, d.icon) : '',
          d ? h('span.cn', L(d, 'name').split(' ')[0]) : '',
        ),
      );
    });

    const palette = h(
      'div.palette',
      sim.availableModules().map((m) =>
        h(
          'button.pm' + (selected === m.id ? '.sel' : ''),
          { 'aria-pressed': selected === m.id ? 'true' : 'false', 'data-testid': 'mod-' + m.id, disabled: m.cost > sim.budget, onclick: () => ((selected = selected === m.id ? null : m.id), app.sfx('click'), coach?.dismiss(), render()) },
          h('span.ti', { 'aria-hidden': 'true' }, m.icon),
          L(m, 'name'),
          h('span.small.muted', `◆${m.cost}`),
        ),
      ),
    );
    const sel = selected && modDef(selected);
    const controls =
      sim.status === 'planning'
        ? h('button.btn.primary.block', { onclick: start, 'data-testid': 'col-start' }, '▶ ', t('col.start'))
        : h('div.row', h('button.btn.grow', { onclick: togglePause }, paused ? '▶ ' + t('ui.resume') : '⏸ ' + t('ui.pause')), h('button.btn', { onclick: toggleSpeed, 'aria-label': t('fly.speed') }, speed + '×'));

    put(root, 
      topbar(app, t('col.title'), { onHelp: () => showCoach(true) }),
      phaseSteps('build'),
      h('div.row.wrap', h('span.chip', statusLine), h('span.chip', '◆ ', t('col.budget', { n: sim.budget })), events.map((e) => h('span.chip', { style: { borderColor: 'var(--amber)', color: 'var(--amber)' } }, '⚠ ', t('colony.event.' + e.id))), upcoming && sim.status === 'running' ? h('span.chip', '📡 ', t('col.tomorrow', { e: t('colony.event.' + upcoming.id) })) : null),
      penalty ? h('p.small', { style: { color: 'var(--amber)', margin: '6px 0' } }, '⚠ ', t('col.penalty')) : null,
      h('p.small.muted', { style: { margin: '6px 0' } }, L(wcfg, 'note')),
      bars,
      h('div', { style: { height: '10px' } }),
      grid,
      h('div', { style: { height: '10px' } }),
      palette,
      h('p.small.muted', { style: { minHeight: '2.6em', margin: '6px 0' } }, sel ? `${sel.icon} ${L(sel, 'name')}: ${L(sel, 'desc')}` : t('col.hint')),
      controls,
    );
    if (!coach && sim.status === 'planning') setTimeout(() => showCoach(false), 50);
  }

  function showCoach(force) {
    coach?.dismiss();
    const b = root.querySelector('.pm');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const rr = app.root.getBoundingClientRect();
    coach = app.coach('colony', { x: r.left - rr.left + r.width / 2, y: r.top - rr.top - 60, text: t('col.coach'), gesture: 'tap' }, force);
  }

  function tapCell(i) {
    if (sim.status === 'won' || sim.status === 'lost') return;
    if (sim.grid[i]) {
      if (sim.status === 'planning') {
        sim.remove(i);
        app.sfx('click');
      } else app.toast(L(cfg.modules.find((m) => m.id === sim.grid[i]), 'desc'));
    } else if (selected) {
      const r = sim.place(i, selected);
      if (!r.ok) app.toast(t('col.cant.' + r.reason));
      else {
        app.sfx('boing');
        app.haptic(12);
      }
    } else app.toast(t('col.pickFirst'));
    ws.colonyLayout = [...sim.grid];
    app.persist();
    render();
  }

  function start() {
    sim.start();
    app.sfx('ping');
    schedule();
    render();
  }
  function togglePause() {
    paused = !paused;
    render();
  }
  function toggleSpeed() {
    speed = speed === 1 ? 2 : 1;
    schedule();
    render();
  }
  function schedule() {
    clearInterval(timer);
    timer = setInterval(tick, 1000 / speed);
  }
  async function tick() {
    if (paused || document.hidden || sim.status !== 'running') return;
    sim.step();
    if (sim.status === 'won') {
      clearInterval(timer);
      app.sfx('success');
      app.evidence(['habitable-zone'].filter(() => world === 'veil'), 'colony:' + world);
      app.persist();
      render();
      await app.modal(h('div', h('div.kicker', t('col.wonKicker')), h('h2', t('col.won', { n: wcfg.days })), h('p', t('col.wonBody'))));
      await app.dialogue(app.content.dialogue.worlds[world].afterBuild);
      app.advance(world, 'build');
      app.go('report', { world });
      return;
    }
    if (sim.status === 'lost') {
      clearInterval(timer);
      app.sfx('fail');
      app.haptic([60, 40, 60]);
      render();
      const chain = sim.chain.map((c) => {
        const p = { ...(c.params || {}) };
        if (p.module) p.module = L(cfg.modules.find((m) => m.id === p.module), 'name');
        if (p.resource) p.resource = t('res.' + p.resource);
        return t(c.key, p);
      });
      const v = await app.modal(
        h('div', h('h2', t('col.lost')), h('p.muted', t('col.lostWhy')), h('div.chain', chain.flatMap((s, i) => [i ? h('div.arrow', { 'aria-hidden': 'true' }, '↓') : null, h('div.step', s)]))),
        [
          { label: t('ui.map'), value: 'map' },
          { label: t('col.retry'), cls: 'primary', value: 'retry' },
        ],
      );
      if (v === 'map') return app.go('map');
      sim = new ColonySim(cfg, wcfg, { penalty });
      (ws.colonyLayout || []).forEach((m, i) => m && sim.place(i, m));
      paused = false;
      render();
      return;
    }
    render();
  }

  render();
  return {
    el: root,
    worldId: world,
    destroy: () => {
      clearInterval(timer);
      coach?.dismiss?.();
    },
    onPause: () => (paused = true),
    get sim() {
      return sim;
    },
  };
}
