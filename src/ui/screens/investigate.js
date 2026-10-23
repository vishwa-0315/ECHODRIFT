/**
 * INVESTIGATE — Alien Archaeologist. Scan hotspots with limited charges,
 * collect clue cards, solve the rock-layer and glyph puzzles, then build a
 * case on the Case Board.
 */
import { h, clear, put } from '../dom.js';
import { t, L } from '../i18n.js';
import { sceneSVG, glyphSVG } from '../art.js';
import { scanResult, evidenceScores, judgeHypothesis, bestSupported, checkLayerOrder, HYPOTHESES } from '../../core/caseboard.js';
import { topbar, phaseSteps } from './common.js';

const TOOLS = [
  { id: 'spectrometer', icon: '🧪' },
  { id: 'drill', icon: '⛏' },
  { id: 'radiation', icon: '☢' },
  { id: 'crater', icon: '🎯' },
  { id: 'thermal', icon: '🌡' },
];

export function investigateScreen(app, { world }) {
  const inv = app.content.investigations[world];
  const ws = app.ws(world);
  const cadet = app.settings.track === 'cadet';
  // Session state (persisted on the world save so a resume keeps progress)
  ws.inv = ws.inv || { collected: [], scanned: [], charges: inv.charges + app.tuning.extraCharges, layersSolved: false, board: {} };
  const st = ws.inv;
  let tool = null;
  let coach = null;
  const root = h('div.screen');

  const clueById = (id) => inv.clues.find((c) => c.id === id);
  const clueText = (c) => (cadet && c.dataCadet ? L(c, 'dataCadet') : L(c, 'data'));

  function renderScan() {
    clear(root);
    const scene = h('div.scene', { html: sceneSVG(inv.scene) });
    for (const hs of inv.hotspots) {
      const scanned = st.scanned.filter((s) => s.startsWith(hs.id + ':')).length > 0;
      scene.appendChild(
        h(
          'button.hotspot' + (scanned ? '.scanned' : '') + (tool ? '.armed' : ''),
          { style: { left: hs.x * 100 + '%', top: hs.y * 100 + '%' }, 'aria-label': `${L(hs, 'label')}${scanned ? ' (' + t('inv.scanned') + ')' : ''}`, 'data-testid': 'hs-' + hs.id, onclick: () => scan(hs) },
          scanned ? '✓' : '',
          h('span.hl', L(hs, 'label')),
        ),
      );
    }
    const toolsEl = h(
      'div.tools',
      { role: 'toolbar', 'aria-label': t('inv.tools') },
      TOOLS.map((tl) => h('button.tool' + (tool === tl.id ? '.sel' : ''), { 'aria-pressed': tool === tl.id ? 'true' : 'false', 'data-testid': 'tool-' + tl.id, onclick: () => selectTool(tl.id) }, h('span.ti', { 'aria-hidden': 'true' }, tl.icon), t('tool.' + tl.id))),
    );
    const charges = h('div.row', h('b', t('inv.charges')), h('span', { 'aria-label': t('inv.chargesLeft', { n: st.charges }) }, '●'.repeat(st.charges) + '○'.repeat(Math.max(0, inv.charges + app.tuning.extraCharges - st.charges))));
    const clues = h('div.list', st.collected.map((id) => clueCard(clueById(id))));
    const openLayers = st.collected.some((id) => clueById(id).opensLayers) && inv.layers && !st.layersSolved;
    put(root, 
      topbar(app, t('inv.title'), { onHelp: () => showCoach(true) }),
      phaseSteps('investigate'),
      scene,
      h('div', { style: { height: '10px' } }),
      charges,
      h('p.small.muted', { style: { margin: '4px 0 8px' } }, tool ? t('inv.tapHotspot') : t('inv.pickTool')),
      toolsEl,
      h('div.row.wrap', { style: { margin: '10px 0' } }, openLayers ? h('button.btn.warm', { onclick: layersPuzzle, 'data-testid': 'layers' }, '🪨 ', t('inv.layers')) : null, h('button.btn', { onclick: glyphPuzzle, 'data-testid': 'glyph' }, ws.glyphSolved ? '✓ ' : '◈ ', t('inv.glyph'))),
      h('h3', t('inv.clues', { n: st.collected.length })),
      st.collected.length ? clues : h('p.muted.small', t('inv.noClues')),
      h('div', { style: { height: '12px' } }),
      h('button.btn.primary.block', { disabled: st.collected.length < 2, onclick: () => renderBoard(), 'data-testid': 'open-board' }, '🗂 ', t('inv.openBoard')),
    );
    if (!coach) setTimeout(() => showCoach(false), 50);
  }

  function showCoach(force) {
    coach?.dismiss();
    const b = root.querySelector('.tool');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const rr = app.root.getBoundingClientRect();
    coach = app.coach('investigate', { x: r.left - rr.left + r.width / 2, y: r.top - rr.top - 70, text: t('inv.coach'), gesture: 'tap' }, force);
  }

  function selectTool(id) {
    tool = tool === id ? null : id;
    app.sfx('click');
    coach?.dismiss();
    renderScan();
  }

  async function scan(hs) {
    if (!tool) {
      app.toast(t('inv.pickTool'));
      return;
    }
    const key = hs.id + ':' + tool;
    if (st.scanned.includes(key)) {
      app.toast(t('inv.already'));
      return;
    }
    const clue = scanResult(inv, hs.id, tool);
    if (!clue) {
      st.scanned.push(key);
      app.sfx('scan');
      app.toast(t('inv.nothing', { tool: t('tool.' + tool) }));
      app.persist();
      renderScan();
      return;
    }
    if (st.charges <= 0) {
      app.toast(t('inv.noCharges'));
      return;
    }
    st.charges--;
    st.scanned.push(key);
    st.collected.push(clue.id);
    if (!app.save.logbook.clues.includes(clue.id)) app.save.logbook.clues.push(clue.id);
    app.sfx('scan');
    app.haptic(20);
    app.persist();
    await app.modal(h('div', h('div.kicker', t('inv.newClue')), clueCard(clue)));
    tool = null;
    renderScan();
    if (st.charges === 0) app.toast(t('inv.outOfCharges'), 3500);
  }

  function clueCard(c, opts = {}) {
    return h(
      'div.card.clue' + (opts.sel ? '.sel' : ''),
      { 'data-clue': c.id },
      h('h4', L(c, 'title')),
      h('div.data', clueText(c)),
      h('div.small.muted', { style: { marginTop: '4px' } }, `${TOOLS.find((x) => x.id === c.tool).icon} ${t('tool.' + c.tool)} · ${L(inv.hotspots.find((x) => x.id === c.hotspot), 'label')}`),
    );
  }

  /* ---------- rock layers (superposition) ---------- */
  async function layersPuzzle() {
    const layers = inv.layers.layers;
    const shuffled = [...layers].sort((a, b) => (a.id < b.id ? 1 : -1));
    if (shuffled.every((l, i) => l.id === layers[i].id)) shuffled.reverse();
    const stack = [];
    const box = h('div');
    const draw = () => {
      clear(box);
      put(box, 
        h('p', L(inv.layers, 'prompt', 'layers-' + world)),
        h('div.kicker', t('inv.layersTop')),
        h(
          'div',
          stack.map((id, i) => {
            const l = layers.find((x) => x.id === id);
            return h('button.layer.btn.block', { style: { background: `hsl(${20 + i * 12} 35% ${40 - i * 6}%)` }, onclick: () => (stack.splice(i, 1), draw()) }, L(l, 'label'), ' ✕');
          }),
          stack.length < layers.length ? h('div.layer', { style: { border: '2px dashed var(--line)', color: 'var(--muted)' } }, t('inv.layersNext')) : null,
        ),
        h('div.kicker', t('inv.layersBottom')),
        h('hr', { style: { borderColor: 'var(--line)', margin: '12px 0' } }),
        h('div.row.wrap', shuffled.filter((l) => !stack.includes(l.id)).map((l) => h('button.btn', { 'data-layer': l.id, onclick: () => (stack.push(l.id), app.sfx('click'), draw()) }, L(l, 'label')))),
      );
    };
    draw();
    const v = await app.modal(box, [
      { label: t('ui.cancel'), value: false },
      { label: t('inv.check'), cls: 'primary', value: true },
    ]);
    if (!v) return;
    if (checkLayerOrder(inv.layers, stack)) {
      st.layersSolved = true;
      st.charges++;
      app.evidence(inv.concepts, 'layers:' + world);
      app.unlockFact('f-superposition');
      app.sfx('success');
      app.persist();
      await app.modal(h('div', h('h2', t('inv.layersRight')), h('p', t('inv.layersWhy'))));
    } else {
      app.sfx('fail');
      app.toast(t('inv.layersWrong'), 3500);
    }
    renderScan();
  }

  /* ---------- Orrin glyphs ---------- */
  async function glyphPuzzle() {
    const g = inv.glyph;
    if (ws.glyphSolved) {
      await app.modal(h('div', h('h2', t('inv.glyph')), h('p', '“' + L({ id: g.fragment, t: app.content.dialogue.fragments[g.fragment] }, 't') + '”')));
      return;
    }
    const style = g.style || 'dots';
    const v = await app.modal(
      h('div', h('h2', t('inv.glyph')), h('p', L(g, 'prompt', 'glyph-' + world)), h('div.row.wrap', g.sequence.map((n) => h('span.glyph', { html: glyphSVG(n, style) })), h('span.glyph', { style: { fontSize: '1.6rem' } }, '?'))),
      g.options.map((n) => ({ label: h('span.row', h('span', { html: glyphSVG(n, style) }), h('span.small', String(n))), value: n })).concat([{ label: t('ui.later'), value: null }]),
    );
    if (v == null) return;
    if (v === g.answer) {
      ws.glyphSolved = true;
      if (!app.save.logbook.fragments.includes(g.fragment)) app.save.logbook.fragments.push(g.fragment);
      app.unlockFact('f-arecibo');
      app.badge('glyph');
      app.sfx('ping');
      app.persist();
      await app.modal(h('div', h('div.kicker', t('inv.fragment')), h('h2', '“' + L({ id: g.fragment, t: app.content.dialogue.fragments[g.fragment] }, 't') + '”')));
    } else {
      app.sfx('fail');
      app.toast(t('inv.glyphWrong'));
    }
    renderScan();
  }

  /* ---------- Case Board ---------- */
  let selected = null;
  function renderBoard() {
    clear(root);
    coach?.dismiss();
    const scores = evidenceScores(st.board, inv.clues);
    const pinnedTo = (id) => HYPOTHESES.find((hh) => (st.board[hh] || []).includes(id));
    const cards = h(
      'div.cluestrip',
      { role: 'list' },
      st.collected.map((id) => {
        const c = clueById(id);
        const card = clueCard(c, { sel: selected === id });
        card.classList.add('tap');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-pressed', selected === id ? 'true' : 'false');
        const where = pinnedTo(id);
        if (where) card.appendChild(h('div.chip', { style: { marginTop: '6px' } }, '📌 ', t('hyp.' + where)));
        attachDrag(card, id);
        card.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && pick(id));
        return card;
      }),
    );
    const slots = h(
      'div.list',
      HYPOTHESES.map((hy) => {
        const pins = st.board[hy] || [];
        const s = scores[hy];
        return h(
          'div.hypo' + (selected ? '.target' : ''),
          { 'data-hyp': hy, role: 'button', tabindex: '0', 'aria-label': t('board.slotAria', { h: t('hyp.' + hy), n: pins.length }), onclick: () => pin(hy), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && pin(hy) },
          h('div.row', h('b.grow', t('hyp.' + hy)), h('button.btn' + (pins.length >= 2 || hy === 'unknown' ? '.primary' : ''), { style: { minHeight: '40px', padding: '6px 12px' }, onclick: (e) => (e.stopPropagation(), submit(hy)), 'data-testid': 'submit-' + hy }, t('board.choose'))),
          h('div.small.muted', t('hypd.' + hy)),
          hy !== 'unknown' ? h('div.strength', { 'aria-label': t('board.strength', { n: s }) }, h('div', { style: { width: Math.max(0, Math.min(100, s * 12)) + '%' } })) : null,
          h('div.pins', pins.map((id) => h('button.chip', { onclick: (e) => (e.stopPropagation(), unpin(hy, id)), 'aria-label': t('board.unpin', { c: L(clueById(id), 'title') }) }, L(clueById(id), 'title'), ' ✕'))),
        );
      }),
    );
    put(root, 
      topbar(app, t('board.title'), { back: () => renderScan() }),
      h('p.small.muted', t('board.how')),
      h('div.kicker', t('board.clues')),
      cards,
      h('div.kicker', { style: { marginTop: '10px' } }, t('board.hypotheses')),
      slots,
    );
  }
  function pick(id) {
    selected = selected === id ? null : id;
    app.sfx('click');
    renderBoard();
  }
  function pin(hy, id = selected) {
    if (!id) return;
    for (const k of HYPOTHESES) st.board[k] = (st.board[k] || []).filter((x) => x !== id);
    (st.board[hy] = st.board[hy] || []).push(id);
    selected = null;
    app.sfx('click');
    app.haptic(10);
    app.persist();
    renderBoard();
  }
  function unpin(hy, id) {
    st.board[hy] = (st.board[hy] || []).filter((x) => x !== id);
    app.persist();
    renderBoard();
  }
  /** Pointer drag: drag a clue card onto a hypothesis slot. Tap still selects. */
  function attachDrag(card, id) {
    let start = null;
    let ghost = null;
    card.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    card.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
        card.setPointerCapture?.(e.pointerId);
        ghost = card.cloneNode(true);
        Object.assign(ghost.style, { position: 'fixed', pointerEvents: 'none', width: card.offsetWidth + 'px', opacity: '.85', zIndex: 50, transform: 'rotate(-3deg)' });
        document.body.appendChild(ghost);
      }
      if (ghost) {
        ghost.style.left = e.clientX - 40 + 'px';
        ghost.style.top = e.clientY - 20 + 'px';
      }
    });
    card.addEventListener('pointerup', (e) => {
      if (!start) return;
      if (ghost) {
        ghost.remove();
        ghost = null;
        const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-hyp]');
        if (under) pin(under.dataset.hyp, id);
      } else pick(id);
      start = null;
    });
    card.addEventListener('pointercancel', () => {
      ghost?.remove();
      ghost = null;
      start = null;
    });
  }

  async function submit(hy) {
    const res = judgeHypothesis(inv, st.board, hy);
    if (res.result === 'needMore') {
      app.toast(t('board.needMore', { n: res.needMore }), 3000);
      return;
    }
    const lines = app.content.dialogue.worlds[world];
    const ex = (k) => L({ id: `${world}-ex-${k}`, t: inv.explanations[k] }, 't');
    if (res.result === 'correct') {
      app.sfx('success');
      ws.hypothesis = 'correct';
      app.evidence(inv.concepts, 'case:' + world);
      await app.modal(h('div', h('div.kicker', t('board.correct')), h('h2', t('hyp.' + hy)), h('p', ex(hy))));
      await app.dialogue(lines.correct);
    } else if (res.result === 'unknown') {
      ws.hypothesis = 'unknown';
      app.badge('honest');
      await app.modal(h('div', h('h2', t('hyp.unknown')), h('p', ex('unknown'))));
      await app.dialogue(lines.unknown);
    } else {
      app.sfx('fail');
      ws.hypothesis = 'wrong';
      const best = bestSupported(st.collected, inv.clues).hypothesis;
      await app.modal(
        h(
          'div',
          h('div.kicker', t('board.wrong')),
          h('h2', t('hyp.' + hy)),
          h('p', ex(hy)),
          h('p', h('b', t('board.evidencePointed')), ' ', t('hyp.' + (best || inv.answer)), '. ', best === inv.answer ? '' : t('board.realAnswer', { h: t('hyp.' + inv.answer) })),
          h('p.small.muted', ex(inv.answer)),
          h('p.small', { style: { color: 'var(--amber)' } }, '⚠ ', t('board.consequence')),
        ),
      );
      await app.dialogue(lines.wrong);
    }
    for (const f of inv.clues.filter((c) => st.collected.includes(c.id))) if (!app.save.logbook.clues.includes(f.id)) app.save.logbook.clues.push(f.id);
    app.advance(world, 'investigate');
    app.go('colony', { world });
  }

  renderScan();
  return {
    el: root,
    worldId: world,
    destroy: () => coach?.dismiss?.(),
  };
}
