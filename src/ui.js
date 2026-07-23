// Shared DOM helpers and reusable UI components (ship cards, stat rows, tooltips).
import { t, locName, locField } from './i18n.js';
import { DB } from './data.js';
import { abilityMeta } from './state.js';
import { attachTooltip, hideTooltip } from './tooltip.js';
import { drawShip } from './sprites.js';

// Tiny hyperscript helper.
export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.id) node.id = opts.id;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.html !== undefined) node.innerHTML = opts.html;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.style) node.style.cssText = opts.style;
  if (opts.on) for (const [ev, fn] of Object.entries(opts.on)) node.addEventListener(ev, fn);
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function app() {
  return document.getElementById('app');
}

// Render a screen root into #app.
export function mount(node) {
  const root = app();
  hideTooltip();
  clear(root);
  root.appendChild(node);
}

// A stat bar (hp/shield) with fill.
export function bar(cur, max, kind) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return el('div', { class: `bar bar-${kind}` }, [
    el('div', { class: 'bar-fill', style: `width:${pct}%` }),
    el('span', { class: 'bar-label', text: `${Math.max(0, Math.round(cur))}/${Math.round(max)}` }),
  ]);
}

const EFFECT_ICONS = { fire: '🔥', slow: '⛓️', immobilized: '🪝', braced: '🛡️', marked: '🎯' };
const EFFECT_KEYS = { fire: 'eff_fire', slow: 'eff_slow', immobilized: 'eff_immobilized', braced: 'eff_braced', marked: 'eff_marked' };

export function effectChips(ship) {
  const wrap = el('div', { class: 'effects' });
  for (const fx of ship.effects || []) {
    const chip = el('span', { class: `eff eff-${fx.type}`, text: `${EFFECT_ICONS[fx.type] || '•'}${fx.turns ? fx.turns : ''}` });
    attachTooltip(chip, () => `<b>${t(EFFECT_KEYS[fx.type] || fx.type)}</b>` + (fx.amount ? `<br>${fx.amount}/tour` : '') + (fx.turns ? `<br>${fx.turns} ${t('turn')}` : ''));
    wrap.appendChild(chip);
  }
  return wrap;
}

// Full stat block HTML for tooltips.
export function statBlockHtml(ship, { isEnemy = false } = {}) {
  const rows = [
    ['stat_hp', `${Math.round(ship.hp)}/${Math.round(ship.maxHp)}`, '❤️'],
    ['stat_armor', ship.armor, '🛡️'],
    ['stat_shield', `${Math.round(ship.shield)}/${Math.round(ship.maxShield)}`, '🔰'],
    ['stat_damage', ship.damage, '💥'],
    ['stat_accuracy', `${Math.round(ship.accuracy * 100)}%`, '🎯'],
    ['stat_speed', ship.speed, '⛵'],
    ['stat_evasion', `${Math.round((ship.evasion || 0) * 100)}%`, '💨'],
    ['stat_morale', ship.morale, '⚓'],
  ];
  let html = `<div class="tt-title">${ship.name || locName(ship.def)}</div>`;
  if (ship.level) html += `<div class="tt-sub">${t('fleet_level')} ${ship.level}</div>`;
  html += '<div class="tt-stats">';
  for (const [key, val, ic] of rows) html += `<div><span>${ic} ${t(key)}</span><b>${val}</b></div>`;
  html += '</div>';
  const am = abilityMeta(ship);
  if (am) html += `<div class="tt-ability">⭐ <b>${t(am.nameKey)}</b><br>${t(am.descKey)}</div>`;
  // Weakness + advice for enemies.
  if (isEnemy && ship.def && ship.def.weakness) {
    const wk = ship.def.weakness;
    const ammo = DB.ammo[wk];
    const wkName = ammo ? locName(ammo) : t(`stat_${wk}`) || wk;
    html += `<div class="tt-weak">⚠️ ${t('weakness')}: <b>${wkName}</b><br><i>${t('advice_use')} ${wkName}</i></div>`;
  }
  if (ship.def && locField(ship.def, 'desc')) {
    html += `<div class="tt-desc">${locField(ship.def, 'desc')}</div>`;
  }
  return html;
}

// A ship card used in combat/fleet: canvas sprite + name + hp/shield bars + effects.
export function shipCard(ship, { isEnemy = false, onClick = null, showIntent = null, selectable = false } = {}) {
  const card = el('div', { class: `ship-card ${isEnemy ? 'enemy' : 'ally'} ${ship.flagship ? 'flagship' : ''} ${selectable ? 'selectable' : ''}` });
  if (ship.hp <= 0) card.classList.add('dead');

  const canvas = el('canvas', { class: 'ship-canvas' });
  canvas.width = 110; canvas.height = 90;
  const type = isEnemy ? (ship.def?.type || ship.def?.tier || 'frigate') : ship.def.type;
  const damaged = 1 - Math.max(0, ship.hp) / ship.maxHp;
  drawShip(canvas, {
    type: isEnemy ? enemyTemplate(ship.def) : ship.def.type,
    color: ship.color || ship.def.color || '#c9a24b',
    flag: isEnemy ? '#7a2b2b' : '#b23b3b',
    facing: isEnemy ? -1 : 1,
    damaged,
  });
  card.appendChild(canvas);

  card.appendChild(el('div', { class: 'ship-name', text: (ship.name || locName(ship.def)) + (ship.flagship ? ' ★' : '') }));
  const bars = el('div', { class: 'ship-bars' }, [bar(ship.hp, ship.maxHp, 'hp')]);
  if (ship.maxShield > 0) bars.appendChild(bar(ship.shield, ship.maxShield, 'shield'));
  card.appendChild(bars);
  card.appendChild(effectChips(ship));

  if (showIntent) card.appendChild(showIntent);

  attachTooltip(card, () => statBlockHtml(ship, { isEnemy }));
  if (onClick) card.addEventListener('click', () => onClick(ship, card));
  card._ship = ship;
  return card;
}

function enemyTemplate(def) {
  if (def.isBoss || def.type === 'naval_monster') return 'monster';
  const t = def.type || def.tier;
  if (t === 'medium') return 'galleon';
  return 'frigate';
}

// Simple modal overlay. Returns { overlay, close }.
export function modal(contentNode, { closable = true, cls = '' } = {}) {
  const overlay = el('div', { class: `overlay ${cls}` });
  const box = el('div', { class: 'modal' }, [contentNode]);
  overlay.appendChild(box);
  const close = () => overlay.remove();
  if (closable) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }
  document.body.appendChild(overlay);
  return { overlay, box, close };
}

export function goldPill() {
  return el('span', { class: 'res-pill gold', html: `💰 <b>${window.__state?.resources.gold ?? 0}</b>` });
}
