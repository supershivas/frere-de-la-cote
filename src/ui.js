// Shared DOM helpers and reusable UI components (ship cards, stat rows, tooltips).
import { t, locName, locField } from './i18n.js';
import { DB } from './data.js';
import { abilityMeta, state } from './state.js';
import { attachTooltip, hideTooltip } from './tooltip.js';
import { drawShip, getGeneratedShip, drawGrid } from './sprites.js';

// Headroom (px) kept above the waterline-clip window so the mast never gets
// clipped as the ship bobs (see the waterline-clip wrapper in shipCard below).
const WATER_TOP_BUFFER = 10;

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
  // Sea for anything happening AT SEA — the title, the fights, the deck view,
  // the chart. Parchment for the setup screens, which are documents: the
  // chasse-partie was a real contract, written and voted (§8.2), and it is
  // meant to read as a signed sheet rather than a menu.
  const sea = state.screen === 'combat' || state.screen === 'title'
    || state.screen === 'pont' || state.screen === 'bataille' || state.screen === 'carte';
  document.body.dataset.bg = sea ? 'sea' : 'parchment';
}

// A stat bar (hp/shield) with fill and an always-visible icon + number.
export function bar(cur, max, kind, icon = '') {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return el('div', { class: `bar bar-${kind}` }, [
    el('div', { class: 'bar-fill', style: `width:${pct}%` }),
    el('span', { class: 'bar-label' }, [
      icon ? el('span', { class: 'bar-ico', text: icon }) : null,
      el('span', { class: 'bar-num', text: `${Math.max(0, Math.round(cur))} / ${Math.round(max)}` }),
    ]),
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
// size: square box (px) the card/stage occupies — generated hulls are taller
// than wide, so a square box (not the old 110:90 landscape one) is what lets
// the sprite actually render at a comfortable size. Combat scales this down
// automatically when a fleet has 3+ ships, to keep a fixed-height arena
// without ever scrolling.
// scale: shared px-per-grid-cell for the whole battle (combat.js computes it
// once from the largest hull class present) — every ship uses the SAME
// scale so a small sloop renders proportionally smaller than a big galleon,
// instead of each ship being fit to its own box independently.
export function shipCard(ship, { isEnemy = false, onClick = null, showIntent = null, selectable = false, combat = false, size = 150, scale = null } = {}) {
  // Bars render from the "shown" values, which lag real HP until a shot lands.
  const shownHp = ship.shownHp ?? ship.hp;
  const shownShield = ship.shownShield ?? ship.shield;
  const damaged = 1 - Math.max(0, shownHp) / ship.maxHp;
  // A sinking (destroyed) ship keeps smoking/burning rather than cutting out
  // the moment its HP hits 0.
  const card = el('div', {
    class: `ship-card ${isEnemy ? 'enemy' : 'ally'} ${ship.flagship ? 'flagship' : ''} ${selectable ? 'selectable' : ''} ${damaged > 0.6 ? 'smoking' : ''}`,
    attrs: { 'data-iid': ship.iid },
    style: `width:${size + 20}px`,
  });
  if (shownHp <= 0) card.classList.add('dead');

  const w = size, h = size;
  let stageChildren;

  if (combat && ship.spriteSpec) {
    // Generative ship in combat: render the FULL hull (no bitmap clip) and cut
    // it at the waterline with a fixed-size, overflow-hidden wrapper instead —
    // the bob animation below moves the CANVAS inside that fixed window, so
    // the waterline itself never shifts on screen while more/less hull shows
    // as the ship bobs (see .ship-waterline-clip in style.css).
    const gen = getGeneratedShip(ship.spriteSpec);
    const s = scale || Math.max(1, Math.floor(Math.min(w / gen.W, h / gen.H)));
    const canvas = el('canvas', { class: 'ship-canvas' });
    canvas.width = gen.W * s; canvas.height = gen.H * s;
    drawGrid(canvas, gen.grid, { color: gen.palette, flag: '', facing: isEnemy ? -1 : 1, damaged });
    canvas.style.position = 'absolute';
    canvas.style.top = `${WATER_TOP_BUFFER}px`;
    canvas.style.left = '0';
    const waterPx = Math.round(gen.waterY * s);
    const clip = el('div', {
      class: 'ship-waterline-clip',
      style: `width:${gen.W * s}px;height:${waterPx + WATER_TOP_BUFFER}px`,
    }, [canvas]);
    stageChildren = [clip];
  } else {
    const canvas = el('canvas', { class: 'ship-canvas' });
    canvas.width = w; canvas.height = h;
    drawShip(canvas, {
      type: isEnemy ? enemyTemplate(ship.def) : ship.def.type,
      color: ship.color || ship.def.color || '#c9a24b',
      flag: isEnemy ? '#7a2b2b' : '#b23b3b',
      facing: isEnemy ? -1 : 1,
      damaged,
      spriteSpec: ship.spriteSpec || null,
      // Combat truncates the hull at the waterline; other screens show the full ship.
      waterline: combat,
    });
    stageChildren = [canvas];
  }
  // Water stage: ship floats on an animated waterline with a wake reflection.
  const stage = el('div', { class: `ship-stage ${combat ? 'in-combat' : ''}`, style: `width:${w}px;height:${h}px` }, [
    ...stageChildren,
    combat ? el('div', { class: 'wake' }) : null,
  ]);
  card.appendChild(stage);

  card.appendChild(el('div', { class: 'ship-name', text: (ship.name || locName(ship.def)) + (ship.flagship ? ' ★' : '') }));
  const bars = el('div', { class: 'ship-bars' }, [bar(shownHp, ship.maxHp, 'hp', '❤️')]);
  if (ship.maxShield > 0) bars.appendChild(bar(shownShield, ship.maxShield, 'shield', '🛡️'));
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

// Colour-coded result modal for events / treasure / rewards.
// tone: 'positive' (green), 'negative' (red), 'reward' (gold), 'curse' (purple),
// 'neutral' (blue). lines are HTML strings.
// eyebrow: small label shown above the title (e.g. "Relic obtained") so the
// title itself can just be the reward's own name, kept as the clear h2.
export function outcomeModal({ tone = 'neutral', icon = '', eyebrow = '', title = '', lines = [], onClose } = {}) {
  const box = el('div', { class: `result-box outcome tone-${tone}` }, [
    icon ? el('div', { class: 'outcome-icon', text: icon }) : null,
    eyebrow ? el('div', { class: 'outcome-eyebrow', text: eyebrow }) : null,
    el('h2', { class: 'result-title', text: title }),
    ...lines.filter(Boolean).map((l) => el('div', { class: 'outcome-line', html: l })),
    el('button', { class: 'btn-level-1', text: t('continue_btn'), on: { click: () => { close(); if (onClose) onClose(); } } }),
  ]);
  const { close } = modal(box, { closable: false, cls: 'result-overlay' });
  return box;
}

export function goldPill() {
  return el('span', { class: 'res-pill gold', html: `💰 <b>${window.__state?.resources.gold ?? 0}</b>` });
}
