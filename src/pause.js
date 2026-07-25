// Pause menu (ESC / P). Sections: continue, map, fleet, captain, inventory,
// encyclopedia, options, save & quit.
import { el, clear, shipCard } from './ui.js';
import { t, locName, locField, getLang, setLang } from './i18n.js';
import { go } from './nav.js';
import { DB } from './data.js';
import { state, saveGame, clearSave } from './state.js';
import { shipThumb } from './sprites.js';
import { attachTooltip } from './tooltip.js';

let overlay = null;

export function isPauseOpen() {
  return !!overlay;
}

export function openPause() {
  if (overlay) return;
  if (state.screen === 'title' || state.screen === 'editor') return;
  saveGame();
  overlay = el('div', { class: 'overlay pause-overlay' });
  const content = el('div', { class: 'pause-content' });
  const sections = [
    ['continue', '▶', 'pause_continue'],
    ['map', '🗺️', 'pause_map'],
    ['fleet', '⚓', 'pause_fleet'],
    ['captain', '🧭', 'pause_captain'],
    ['inventory', '🎒', 'pause_inventory'],
    ['encyclopedia', '📖', 'pause_encyclopedia'],
    ['options', '⚙️', 'pause_options'],
    ['quit', '🚪', 'pause_quit'],
  ];
  let active = 'map';
  const nav = el('nav', { class: 'pause-nav' });
  const pane = el('div', { class: 'pause-pane' });

  function selectSection(key) {
    active = key;
    [...nav.children].forEach((c) => c.classList.toggle('active', c.dataset.key === key));
    renderSection(key, pane);
  }

  sections.forEach(([key, icon, labelKey]) => {
    const b = el('button', { class: 'pause-nav-btn', attrs: {}, on: { click: () => {
      if (key === 'continue') return closePause();
      if (key === 'map') { closePause(); go('map'); return; }
      if (key === 'quit') return renderQuit(pane);
      selectSection(key);
    } } }, [el('span', { text: icon }), el('span', { text: t(labelKey) })]);
    b.dataset.key = key;
    nav.appendChild(b);
  });

  content.appendChild(el('div', { class: 'pause-header', text: t('pause_title') }));
  content.appendChild(el('div', { class: 'pause-body' }, [nav, pane]));
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  selectSection('fleet');
}

export function closePause() {
  if (overlay) { overlay.remove(); overlay = null; }
}

function renderSection(key, pane) {
  clear(pane);
  switch (key) {
    case 'fleet': return renderFleet(pane);
    case 'captain': return renderCaptain(pane);
    case 'inventory': return renderInventory(pane);
    case 'encyclopedia': return renderEncyclopedia(pane);
    case 'options': return renderOptions(pane);
  }
}

function renderFleet(pane) {
  pane.appendChild(el('h3', { text: t('fleet_title') }));
  const grid = el('div', { class: 'fleet-grid' });
  state.fleet.forEach((s) => {
    const card = el('div', { class: `fleet-card ${s.flagship ? 'flagship' : ''}` }, [
      shipThumb({ type: s.def.type, color: s.color, facing: 1 }, 96),
      el('div', { class: 'fleet-name', text: (s.name || locName(s.def)) + (s.flagship ? ` ★ (${t('fleet_flagship')})` : '') }),
      el('div', { class: 'fleet-lvl', text: `${t('fleet_level')} ${s.level} · ${s.xp}/${40 + s.level * 20} XP` }),
      statLine('❤️', `${Math.round(s.hp)}/${s.maxHp}`),
      statLine('🛡️', s.armor),
      statLine('💥', s.damage),
      statLine('⛵', s.baseSpeed),
      el('div', { class: 'fleet-upgrades', text: s.upgrades.map((u) => DB.upgrades[u]?.icon || '•').join(' ') }),
    ]);
    grid.appendChild(card);
  });
  pane.appendChild(grid);
}

function statLine(icon, val) {
  return el('div', { class: 'stat-line', html: `<span>${icon}</span><b>${val}</b>` });
}

function renderCaptain(pane) {
  pane.appendChild(el('h3', { text: t('captain_title') }));
  pane.appendChild(el('div', { class: 'captain-name', text: `🧭 ${t('captain_name')}` }));
  pane.appendChild(el('div', { class: 'captain-rep', html: `🏴‍☠️ ${t('reputation')}: <b>${state.resources.reputation}</b>` }));
  pane.appendChild(el('h4', { text: t('captain_stats') }));
  const stats = el('div', { class: 'captain-stats' }, [
    el('div', { html: `⚔️ ${t('stat_battles_won')}: <b>${state.stats.battlesWon}</b>` }),
    el('div', { html: `☠️ ${t('stat_ships_sunk')}: <b>${state.stats.shipsSunk}</b>` }),
    el('div', { html: `💰 ${t('stat_gold_earned')}: <b>${state.stats.goldEarned}</b>` }),
  ]);
  pane.appendChild(stats);
}

function renderInventory(pane) {
  pane.appendChild(el('h3', { text: t('inventory_title') }));
  pane.appendChild(el('h4', { text: t('inventory_resources') }));
  const r = state.resources;
  pane.appendChild(el('div', { class: 'inv-res' }, [
    el('div', { html: `💰 ${t('gold')}: <b>${r.gold}</b>` }),
    el('div', { html: `🪵 ${t('wood')}: <b>${r.wood}</b>` }),
    el('div', { html: `⭐ ${t('rare_materials')}: <b>${r.rareMaterials}</b>` }),
    el('div', { html: `🏴‍☠️ ${t('reputation')}: <b>${r.reputation}</b>` }),
  ]));
  pane.appendChild(el('h4', { text: t('inventory_relics') }));
  if (state.relics.length === 0) {
    pane.appendChild(el('div', { class: 'inv-empty', text: t('inventory_empty') }));
  } else {
    const grid = el('div', { class: 'relic-grid' });
    state.relics.forEach((id) => {
      const rel = DB.relics[id];
      const card = el('div', { class: `relic-card rarity-${rel.rarity}` }, [
        el('div', { class: 'relic-icon', text: rel.icon || '⭐' }),
        el('div', { class: 'relic-name', text: locName(rel) }),
        el('div', { class: 'relic-desc', text: locField(rel, 'desc') }),
      ]);
      grid.appendChild(card);
    });
    pane.appendChild(grid);
  }
}

function renderEncyclopedia(pane) {
  pane.appendChild(el('h3', { text: t('encyclopedia_title') }));
  const groups = [
    ['enc_ships', DB.ships, 'ships', false],
    ['enc_enemies', DB.enemies, 'enemies', true],
    ['enc_bosses', DB.bosses, 'bosses', true],
  ];
  for (const [labelKey, db, kind, gated] of groups) {
    pane.appendChild(el('h4', { text: t(labelKey) }));
    const grid = el('div', { class: 'enc-grid' });
    for (const [id, def] of Object.entries(db)) {
      const known = !gated || state.discovered[kind]?.[id] || kind === 'ships';
      const card = el('div', { class: `enc-card ${known ? '' : 'unknown'}` }, [
        el('div', { class: 'enc-name', text: known ? locName(def) : '???' }),
        known ? el('div', { class: 'enc-desc', text: locField(def, 'desc') }) : el('div', { class: 'enc-desc', text: t('enc_undiscovered') }),
      ]);
      if (known) attachTooltip(card, () => `<div class="tt-title">${locName(def)}</div><div class="tt-desc">${locField(def, 'desc')}</div>`);
      grid.appendChild(card);
    }
    pane.appendChild(grid);
  }
}

function renderOptions(pane) {
  pane.appendChild(el('h3', { text: t('options_title') }));
  pane.appendChild(el('div', { class: 'opt-row' }, [
    el('span', { text: t('options_language') }),
    el('div', { class: 'lang-toggle' }, [
      el('button', { class: `lang-btn ${getLang() === 'fr' ? 'active' : ''}`, text: 'FR', on: { click: () => { setLang('fr'); renderOptions(clear(pane)); } } }),
      el('button', { class: `lang-btn ${getLang() === 'en' ? 'active' : ''}`, text: 'EN', on: { click: () => { setLang('en'); renderOptions(clear(pane)); } } }),
    ]),
  ]));
  pane.appendChild(toggleRow('options_sound', 'sound'));
  pane.appendChild(toggleRow('options_music', 'music'));
}

function toggleRow(labelKey, optKey) {
  const val = state.options[optKey];
  return el('div', { class: 'opt-row' }, [
    el('span', { text: t(labelKey) }),
    el('button', { class: `toggle ${val ? 'on' : 'off'}`, text: val ? t('options_on') : t('options_off'), on: { click: (e) => {
      state.options[optKey] = !state.options[optKey];
      const b = e.currentTarget;
      const nv = state.options[optKey];
      b.className = `toggle ${nv ? 'on' : 'off'}`;
      b.textContent = nv ? t('options_on') : t('options_off');
      saveGame();
    } } }),
  ]);
}

function renderQuit(pane) {
  clear(pane);
  pane.appendChild(el('h3', { text: t('pause_quit') }));
  pane.appendChild(el('p', { text: t('confirm_quit') }));
  pane.appendChild(el('div', { class: 'confirm-row' }, [
    el('button', { class: 'btn-level-3 btn-level-3--danger', text: t('yes'), on: { click: () => {
      saveGame();
      closePause();
      go('title');
    } } }),
    el('button', { class: 'btn-level-4', text: t('no'), on: { click: () => renderSection('fleet', pane) } }),
  ]));
}
