// Internationalization — FR/EN. No user-facing string is ever hardcoded in logic.

const locales = {};
let current = 'fr';
const listeners = new Set();

export async function loadLocales() {
  const [fr, en] = await Promise.all([
    fetch('locales/fr.json').then((r) => r.json()),
    fetch('locales/en.json').then((r) => r.json()),
  ]);
  locales.fr = fr;
  locales.en = en;
  const saved = localStorage.getItem('fdlc_lang');
  if (saved && locales[saved]) current = saved;
}

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!locales[lang]) return;
  current = lang;
  localStorage.setItem('fdlc_lang', lang);
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Translate a key, with optional {placeholder} substitution.
export function t(key, params) {
  let str = (locales[current] && locales[current][key]) ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

// Localized name for a data object with name_fr / name_en fields.
export function locName(obj) {
  if (!obj) return '';
  return obj[`name_${current}`] || obj.name_en || obj.name_fr || obj.id || '';
}

// Localized free-text field (desc, text, title, intent, label...).
export function locField(obj, base) {
  if (!obj) return '';
  return obj[`${base}_${current}`] || obj[`${base}_en`] || obj[`${base}_fr`] || '';
}
