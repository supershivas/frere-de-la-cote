// Shared top HUD: resources, act label, relics, pause button.
import { el } from './ui.js';
import { t, locName, locField } from './i18n.js';
import { state, currentWeather } from './state.js';
import { DB } from './data.js';
import { attachTooltip } from './tooltip.js';
import { openPause } from './pause.js';

export function renderHud() {
  const r = state.resources;
  const res = el('div', { class: 'hud-res' }, [
    resPill('💰', r.gold, 'gold'),
    resPill('🪵', r.wood, 'wood'),
    resPill('⭐', r.rareMaterials, 'rare_materials'),
    resPill('🏴‍☠️', r.reputation, 'reputation'),
  ]);

  const weather = weatherChip();

  const relics = el('div', { class: 'hud-relics' });
  for (const id of state.relics) {
    const rel = DB.relics[id];
    if (!rel) continue;
    const chip = el('span', { class: `relic-chip rarity-${rel.rarity}`, text: rel.icon || '⭐' });
    attachTooltip(chip, () => `<div class="tt-title">${locName(rel)}</div><div class="tt-desc">${rel[`desc_${lang()}`] || rel.desc_en}</div>`);
    relics.appendChild(chip);
  }

  const actLabel = el('div', { class: 'hud-act', text: t(`act_${state.act}`) });

  const pauseBtn = el('button', { class: 'hud-pause', text: '☰', attrs: { title: t('pause_title') }, on: { click: () => openPause() } });

  return el('header', { class: 'hud' }, [actLabel, weather, res, relics, pauseBtn]);
}

function weatherChip() {
  const w = currentWeather();
  if (!w) return null;
  const chip = el('span', { class: 'weather-chip', html: `${w.icon} <b>${locName(w)}</b>` });
  attachTooltip(chip, () => weatherTooltip(w));
  return chip;
}

function weatherTooltip(w) {
  const m = w.mods || {};
  const lines = [];
  if (m.accuracyDelta) lines.push(`🎯 ${t('stat_accuracy')} ${m.accuracyDelta > 0 ? '+' : ''}${Math.round(m.accuracyDelta * 100)}%`);
  if (m.evasionDelta) lines.push(`💨 ${t('stat_evasion')} ${m.evasionDelta > 0 ? '+' : ''}${Math.round(m.evasionDelta * 100)}%`);
  if (m.damageMult && m.damageMult !== 1) lines.push(`💥 ${t('stat_damage')} ${m.damageMult > 1 ? '+' : ''}${Math.round((m.damageMult - 1) * 100)}%`);
  if (m.speedMult && m.speedMult !== 1) lines.push(`⛵ ${t('stat_speed')} ${m.speedMult > 1 ? '+' : ''}${Math.round((m.speedMult - 1) * 100)}%`);
  return `<div class="tt-title">${w.icon} ${locName(w)}</div><div class="tt-desc">${locField(w, 'desc')}</div>` + (lines.length ? `<div class="tt-stats">${lines.map((l) => `<div>${l}</div>`).join('')}</div>` : '');
}

function resPill(icon, val, key) {
  const p = el('span', { class: 'res-pill', html: `${icon} <b>${val}</b>` });
  attachTooltip(p, () => t(key));
  return p;
}

function lang() {
  return document.documentElement.lang || 'fr';
}
