/**
 * i18n. UI strings live in content/lang/<lang>.json under "ui". Content text
 * (dialogue, clues, worlds...) is written in English inside the content JSON
 * and translated by id in content/lang/<lang>.json under "content":
 *   "content": { "<object id>.<field>": "translation" }
 * Anything missing falls back to English, so a partial translation is safe.
 */
let packs = {};
let current = 'en';

export function initI18n(langPacks, lang) {
  packs = langPacks;
  setLang(lang);
}
export function setLang(lang) {
  current = packs[lang] ? lang : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
export function getLang() {
  return current;
}
export function languages() {
  return Object.entries(packs).map(([id, p]) => ({ id, name: p.name }));
}

/** UI string by key, with {param} substitution. */
export function t(key, params) {
  let s = packs[current]?.ui?.[key] ?? packs.en?.ui?.[key];
  if (s == null) {
    if (typeof console !== 'undefined') console.warn('[i18n] missing key', key);
    s = key;
  }
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** Translated content field: L(obj, 'title') looks up "<obj.id>.title". */
export function L(obj, field, idOverride) {
  if (!obj) return '';
  const id = idOverride || obj.id;
  const tr = packs[current]?.content?.[`${id}.${field}`];
  return tr ?? obj[field] ?? '';
}
