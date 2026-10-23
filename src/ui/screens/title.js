import { h, fitCanvas } from '../dom.js';
import { t } from '../i18n.js';
import { starField } from '../art.js';
import { VERSION } from '../app.js';

/** Splash/Title: animated star field + pulsing "signal" waveform. */
export function titleScreen(app) {
  const canvas = h('canvas.bgcanvas', { 'aria-hidden': 'true' });
  const field = starField(app.settings.graphics === 'saver' ? 70 : 180);
  let raf = 0;
  const t0 = performance.now();
  const draw = (now) => {
    const { w, h: hh, ctx } = fitCanvas(canvas, app.settings.graphics === 'saver' ? 1 : 2);
    const tt = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, hh);
    field.draw(ctx, w, hh, tt, app.settings.reduceMotion ? 0 : tt * 20, 0);
    // Signal waveform: prime-grouped pulses travelling across.
    const y = hh * 0.62;
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--teal');
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const ph = app.settings.reduceMotion ? 0 : tt * 1.5;
      const env = Math.exp(-(((x / w) * 6 - ((ph % 8) - 1)) ** 2));
      const v = Math.sin(x * 0.12) * 22 * env + Math.sin(x * 0.03 + ph) * 3;
      if (x === 0) ctx.moveTo(x, y + v);
      else ctx.lineTo(x, y + v);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (!app.settings.reduceMotion) raf = requestAnimationFrame(draw);
  };

  const started = Object.values(app.save.worlds).some((w) => w.phase !== 'intro' || w.complete);
  const play = async () => {
    app.sfx('ping');
    app.haptic(15);
    if (!app.save.trackChosen) {
      const track = await app.modal(
        h('div', h('h2', t('track.choose')), h('p.muted', t('track.explain')), h('p', h('b', t('track.cadet')), ' · ', t('track.cadetDesc')), h('p', h('b', t('track.commander')), ' · ', t('track.commanderDesc'))),
        [
          { label: t('track.cadet'), cls: 'primary', value: 'cadet' },
          { label: t('track.commander'), cls: 'warm', value: 'commander' },
        ],
      );
      app.save.trackChosen = true;
      app.setSetting('track', track);
      await app.dialogue(app.content.dialogue.prologue);
    }
    app.go('map');
  };

  const el = h(
    'div.screen.full',
    canvas,
    h(
      'div.title-wrap',
      h('div.kicker', t('title.kicker')),
      h('h1.logo', 'ECHO DRIFT'),
      h('p.muted', { style: { maxWidth: '32ch' } }, t('title.tagline')),
      h('div', { style: { height: '90px' } }),
      h('button.btn.primary', { style: { minWidth: '220px', fontSize: '1.15rem' }, onclick: play, 'data-testid': 'play' }, started ? t('title.continue') : t('title.play')),
      h('div.row', h('button.btn', { onclick: () => app.go('logbook') }, t('nav.logbook')), h('button.btn', { onclick: () => app.go('settings', { from: 'title' }) }, t('nav.settings'))),
      app.contentErrors.length ? h('p.small', { style: { color: 'var(--danger)' } }, t('err.content', { n: app.contentErrors.length })) : null,
      h('p.small.muted', `v${VERSION} · ${t('title.offline')}`),
    ),
  );
  return {
    el,
    mounted: () => (raf = requestAnimationFrame(draw)),
    destroy: () => cancelAnimationFrame(raf),
  };
}
