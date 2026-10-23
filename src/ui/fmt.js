/** Formatting helpers (SI units, human-friendly). */
import { AU, LY } from '../core/constants.js';

export function dist(m) {
  const a = Math.abs(m);
  if (a >= 0.1 * AU) return (m / AU).toFixed(a >= 10 * AU ? 1 : 3) + ' AU';
  if (a >= 1e6) return Math.round(m / 1e3).toLocaleString('en-US') + ' km';
  if (a >= 1e4) return (m / 1e3).toFixed(0) + ' km';
  if (a >= 1e3) return (m / 1e3).toFixed(1) + ' km';
  return m.toFixed(0) + ' m';
}
export const km = (m) => (m / 1e3).toLocaleString('en-US', { maximumFractionDigits: m < 1e5 ? 1 : 0 }) + ' km';
export const speed = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(3) + ' km/s' : v.toFixed(1) + ' m/s');
export const dv = (v) => v.toFixed(v < 10 ? 2 : 1) + ' m/s';
export const kg = (m) => m.toFixed(m < 100 ? 1 : 0) + ' kg';
export function dur(s) {
  s = Math.abs(s);
  if (s < 90) return s.toFixed(0) + ' s';
  if (s < 5400) return (s / 60).toFixed(1) + ' min';
  if (s < 2 * 86400) return (s / 3600).toFixed(1) + ' h';
  if (s < 3 * 365.25 * 86400) return (s / 86400).toFixed(1) + ' d';
  return (s / (365.25 * 86400)).toFixed(1) + ' yr';
}
export function utc(d) {
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
export function dateShort(d) {
  return d.toISOString().slice(0, 10);
}
export function sci(x, digits = 2) {
  if (!Number.isFinite(x)) return '—';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  return `${m.toFixed(digits)} × 10^${e}`;
}
export const ly = (m) => (m / LY).toFixed(m / LY < 10 ? 2 : 0) + ' ly';
