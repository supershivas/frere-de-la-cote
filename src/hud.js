// Shared top HUD: resources, act label, relics, pause button.
import { el } from './ui.js';
import { t, locName } from './i18n.js';
import { state } from './state.js';
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

  return el('header', { class: 'hud' }, [actLabel, res, relics, pauseBtn]);
}

function resPill(icon, val, key) {
  const p = el('span', { class: 'res-pill', html: `${icon} <b>${val}</b>` });
  attachTooltip(p, () => t(key));
  return p;
}

function lang() {
  return document.documentElement.lang || 'fr';
}
