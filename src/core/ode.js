/**
 * LAUNCH WINDOW — numerical integration.
 *
 * Dormand–Prince 5(4) (DOPRI5): the adaptive Runge–Kutta method used in real
 * trajectory software (e.g. MATLAB ode45). Each step estimates its own error
 * and the step size adapts so the solution stays within the requested
 * tolerance, whether the spacecraft is skimming a planet or cruising for months.
 */

// Butcher tableau
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const A71 = 35 / 384, A73 = 500 / 1113, A74 = 125 / 192, A75 = -2187 / 6784, A76 = 11 / 84;
// error coefficients (5th − 4th order)
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

/**
 * Create an integrator for dy/dt = f(t, y, out). y is a plain array.
 * opts: { rtol, atol (number or array), hmin, hmax }
 */
export function createDopri(f, n, opts = {}) {
  const rtol = opts.rtol ?? 1e-10;
  const atolArr = Array.isArray(opts.atol) ? opts.atol : Array(n).fill(opts.atol ?? 1e-6);
  const hmax = opts.hmax ?? Infinity;
  const hmin = opts.hmin ?? 1e-9;
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), k4 = new Float64Array(n);
  const k5 = new Float64Array(n), k6 = new Float64Array(n), k7 = new Float64Array(n);
  const yt = new Float64Array(n), y5 = new Float64Array(n);
  let fsal = false;

  /** Attempt one step; returns {ok, err}. Writes the result into y5. */
  function attempt(t, y, h) {
    if (!fsal) f(t, y, k1);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * A21 * k1[i];
    f(t + C2 * h, yt, k2);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A31 * k1[i] + A32 * k2[i]);
    f(t + C3 * h, yt, k3);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    f(t + C4 * h, yt, k4);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    f(t + C5 * h, yt, k5);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    f(t + h, yt, k6);
    for (let i = 0; i < n; i++) y5[i] = y[i] + h * (A71 * k1[i] + A73 * k3[i] + A74 * k4[i] + A75 * k5[i] + A76 * k6[i]);
    f(t + h, y5, k7);
    let err = 0;
    for (let i = 0; i < n; i++) {
      const e = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
      const sc = atolArr[i] + rtol * Math.max(Math.abs(y[i]), Math.abs(y5[i]));
      err += (e / sc) ** 2;
    }
    return Math.sqrt(err / n);
  }

  const self = {
    h: opts.h0 ?? 1,
    steps: 0,
    rejects: 0,
    /**
     * Advance state y (mutated) from t to t+dt. Calls onStep(t, y) after every
     * accepted internal step (for event checks / path sampling). Returns final t.
     * If onStep returns true the integration stops early (event).
     */
    advance(t, y, dt, onStep) {
      const tEnd = t + dt;
      const dir = Math.sign(dt) || 1;
      let h = Math.min(Math.abs(self.h), hmax, Math.abs(dt)) * dir;
      fsal = false;
      let guard = 0;
      while ((tEnd - t) * dir > 1e-12) {
        if (++guard > 2e6) throw new Error('integrator: too many steps');
        if ((t + h - tEnd) * dir > 0) h = tEnd - t;
        const err = attempt(t, y, h);
        if (err <= 1 || Math.abs(h) <= hmin) {
          t += h;
          for (let i = 0; i < n; i++) {
            y[i] = y5[i];
            k1[i] = k7[i];
          }
          fsal = true;
          self.steps++;
          const fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * err ** -0.2));
          const hNext = Math.min(Math.abs(h) * fac, hmax);
          // don't let a shortened final step shrink the remembered step size
          if (Math.abs(h) >= Math.abs(self.h) * 0.5 || (tEnd - t) * dir > 1e-12) self.h = hNext * dir;
          h = hNext * dir;
          if (onStep && onStep(t, y)) return t;
        } else {
          fsal = false;
          self.rejects++;
          h = h * Math.max(0.1, 0.9 * err ** -0.25);
        }
      }
      return t;
    },
    reset(h0) {
      self.h = h0 ?? self.h;
      fsal = false;
    },
  };
  return self;
}

/** Classic fixed-step RK4 (used for short, smooth problems like landers). */
export function rk4Step(f, t, y, h, n, tmp) {
  const { k1, k2, k3, k4, yt } = tmp;
  f(t, y, k1);
  for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * h * k1[i];
  f(t + 0.5 * h, yt, k2);
  for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * h * k2[i];
  f(t + 0.5 * h, yt, k3);
  for (let i = 0; i < n; i++) yt[i] = y[i] + h * k3[i];
  f(t + h, yt, k4);
  for (let i = 0; i < n; i++) y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

export function rk4Scratch(n) {
  return { k1: new Float64Array(n), k2: new Float64Array(n), k3: new Float64Array(n), k4: new Float64Array(n), yt: new Float64Array(n) };
}
