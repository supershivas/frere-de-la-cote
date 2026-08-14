// The fight — step 4 of the chantier, built on `battle.js` (rules) and
// `deckView.js` (rendering). One ship against one ship (§7).
//
// The turn structure is printed on screen at all times, because not stating it
// was the single biggest source of confusion in the previous prototype (§5.7):
//   move men freely, then ONE manoeuvre and ONE broadside, in any order.
//
// Enemy intent is shown a full turn ahead (§4.2), and nothing is rolled (§4.1),
// so a turn is a puzzle rather than a gamble.

import { el, mount } from '../ui.js';
import { t } from '../i18n.js';
import { register, go } from '../nav.js';
import { state, buildSpriteSpec } from '../state.js';
import { planFor, SYSTEMS } from '../shipPlans.js';
import { renderDeck, walk } from '../deckView.js';
import { getGeneratedShip } from '../sprites.js';
import {
  AMMO, RANGES, BOARD, MUSKET, CANNON, FAR,
  makeShip, newBattle, broadside, manoeuvre, endTurn, board, canBoard,
  canFire, canManoeuvre, orderMove, spreadTarget, spoils, boardingStrength,
  isUndermanned, planOf,
} from '../battle.js';

const MINE_WIDTH = 0.54;
const THEIRS_WIDTH = 0.33;

let B = null;                       // battle state
let sel = { man: null, ammo: 'boulet', aiming: false };
let hosts = { mine: null, theirs: null };

const CREW = [
  { id: 1, name: 'Etcheverry', role: 'canonnier', specialty: 'canonnage', at: 'batterie' },
  { id: 2, name: 'Coudray', role: "maître d'équipage", specialty: 'manoeuvre', at: 'mat' },
  { id: 3, name: 'Toussaint', role: 'charpentier', specialty: 'reparation', at: 'cale' },
  { id: 4, name: 'Ozanne', role: 'chirurgien', specialty: 'soins', at: 'proue' },
  { id: 5, name: 'Gohier', role: 'matelot', specialty: 'melee', at: 'barre' },
];

function startBattle(opts = {}) {
  const hullTheirs = opts.enemyHull || 3;
  const mine = makeShip({
    name: state.shipName || 'La Trompeuse',
    hullClass: 3, mine: true, facing: 1,
    spriteSpec: buildSpriteSpec({ hullClass: 3, hullShape: 'auto', sailsPerMast: 2, jibs: 1, wear: 0 }, 'free_pirates', 42),
    crew: CREW.map((c) => ({ ...c })),
    hands: 55,
  });
  const theirs = makeShip({
    name: opts.enemyName || 'Sancta Ana',
    hullClass: hullTheirs, facing: -1,
    spriteSpec: buildSpriteSpec({ hullClass: hullTheirs, hullShape: 'auto', sailsPerMast: 2, jibs: 1, wear: 1 }, 'espagnole', 7),
    crew: enemyCrewFor(hullTheirs),
    hands: planFor(hullTheirs).minCrew * 2,
  });
  B = newBattle(mine, theirs, { distance: CANNON });
  sel = { man: null, ammo: 'boulet', aiming: false };
}

function enemyCrewFor(hullClass) {
  const plan = planFor(hullClass);
  const rooms = Object.keys(plan.rooms);
  const pick = (system, fallback) =>
    rooms.find((k) => plan.rooms[k].system === system) || fallback;
  return [
    { id: 11, name: '?', specialty: 'canonnage', at: pick('canons', rooms[0]) },
    { id: 12, name: '?', specialty: 'manoeuvre', at: pick('voiles', rooms[0]) },
    { id: 13, name: '?', specialty: 'reparation', at: pick('pompes', rooms[0]) },
  ];
}

// ---------------------------------------------------------------------------

function render() {
  state.screen = 'bataille';
  if (!B) startBattle();

  const root = el('div', { class: 'screen bat-screen' }, [
    rangeStrip(),
    el('div', { class: 'pont-sea bat-sea' }, [shipBlock(B.ships.mine), shipBlock(B.ships.theirs)]),
    intentBar(),
    actionBar(),
    el('div', { class: 'bat-rules', text: t('bat_rules') }),
  ]);
  mount(root);
  layoutSea();
  if (B.phase === 'over') showOutcome();
}

// The four bands, always visible, with the current one marked (§5.2).
function rangeStrip() {
  const strip = el('div', { class: 'bat-range' });
  for (let d = BOARD; d <= FAR; d++) {
    strip.appendChild(el('span', {
      class: `bat-range-step${d === B.distance ? ' now' : ''}`,
      text: t(`range_${RANGES[d]}`),
    }));
  }
  strip.appendChild(el('span', { class: 'bat-turn', text: `${t('bat_turn')} ${B.turn}` }));
  return strip;
}

function shipBlock(ship) {
  const wrap = el('div', { class: 'pont-ship' });
  wrap.dataset.side = ship.mine ? 'mine' : 'theirs';
  wrap.appendChild(shipCaption(ship));
  const host = el('div');
  wrap.appendChild(host);
  hosts[ship.mine ? 'mine' : 'theirs'] = host;

  renderDeck(host, ship, {
    scale: 8,
    selectedId: ship.mine && sel.man ? sel.man.id : null,
    onPickMan: (man) => { if (B.phase !== 'over') { sel.man = sel.man?.id === man.id ? null : man; sel.aiming = false; render(); } },
    onPickRoom: (key) => onRoom(key, ship),
  });
  return wrap;
}

function shipCaption(ship) {
  const bits = [ship.name];
  if (!canManoeuvre(ship)) bits.push(t('bat_dismasted'));
  if (ship.flooding) bits.push(`${t('bat_flooding')} ${ship.flooding}`);
  if (isUndermanned(ship)) bits.push(t('bat_undermanned'));
  const cap = el('div', { class: 'pont-cap' }, [
    el('div', { text: bits.join(' · ') }),
    el('div', { text: `${t('bat_hands')} ${ship.hands} · ${boardingStrength(ship)}⚔` }),
  ]);
  return cap;
}

function onRoom(key, ship) {
  if (B.phase === 'over') return;
  // Aiming: the click picks the room the broadside lands in.
  if (sel.aiming && !ship.mine) {
    if (broadside(B, sel.ammo, key)) { sel.aiming = false; render(); }
    return;
  }
  // Otherwise, a selected man is being sent somewhere on our own ship.
  if (sel.man && ship.mine) {
    if (sel.man.at === key) { sel.man = null; return render(); }
    sendMan(ship, sel.man, key);
    return;
  }
  describe(key, ship);
}

// Ordering a move is free (§5.7); the walk takes turns (§6.3) and is animated
// by moving the existing token rather than rebuilding it.
function sendMan(ship, man, to) {
  const host = hosts.mine;
  orderMove(B, ship, man, to);
  sel.man = null;
  host.querySelectorAll('.deck-room').forEach((n) => n.classList.remove('reachable', 'here'));
  walk(host, ship, man, to, { onStep: () => {}, onArrive: () => render() });
}

function describe(key, ship) {
  const room = planOf(ship).rooms[key];
  const hp = ship.structure[key] ?? room.hp;
  B.note = {
    title: `${t(room.name)} — ${hp}/${room.hp}`,
    text: hp <= 0 ? t(SYSTEMS[room.system].atZero)
      : `${t(`spec_${SYSTEMS[room.system].specialty}`)} · ${t(SYSTEMS[room.system].atZero)}`,
  };
  render();
}

// What the enemy will do, one full turn before it does it (§4.2).
function intentBar() {
  const bar = el('div', { class: 'bat-intent' });
  const intent = B.intent;
  if (!intent) return bar;
  const plan = planOf(B.ships.mine);
  let text = '';
  if (intent.kind === 'fire') {
    text = `${t('bat_intent_fire')} ${t(plan.rooms[intent.room].name)} — ${AMMO[intent.ammo].icon} ${t(AMMO[intent.ammo].label)}`;
  } else if (intent.kind === 'close') text = t('bat_intent_close');
  else if (intent.kind === 'board') text = t('bat_intent_board');
  bar.appendChild(el('b', { text: `⚠ ${t('bat_intent')} : ` }));
  bar.appendChild(el('span', { text }));

  // A fire about to spread is announced too — losing a ship is never a surprise.
  for (const [side, ship] of [['mine', B.ships.mine], ['theirs', B.ships.theirs]]) {
    for (const [key, level] of Object.entries(ship.fire)) {
      if (level < 3) continue;
      const next = spreadTarget(ship, key);
      if (!next) continue;
      bar.appendChild(el('span', {
        class: 'warn',
        text: ` · 🔥 ${t('bat_fire_warning')} ${t(planOf(ship).rooms[next].name)} (${ship.name})`,
      }));
    }
  }
  if (B.note) {
    bar.appendChild(el('span', { class: 'bat-note', text: ` · ${B.note.title} — ${B.note.text}` }));
  }
  return bar;
}

function actionBar() {
  const bar = el('div', { class: 'bat-actions' });
  if (B.phase === 'over') return bar;
  const mine = B.ships.mine;

  // Munitions: five buttons, each doing a different job, with the consequence
  // spelled out (§4.6 — plain language first, period flavour second).
  const ammoRow = el('div', { class: 'bat-ammo' });
  for (const ammo of Object.values(AMMO)) {
    const tooFar = B.distance > ammo.maxRange;
    const btn = el('button', {
      class: `bat-ammo-btn${sel.ammo === ammo.id ? ' on' : ''}${tooFar ? ' far' : ''}`,
      title: `${t(ammo.label)} — ${t(ammo.hint)}${tooFar ? ` (${t('bat_out_of_range')})` : ''}`,
      on: { click: () => { sel.ammo = ammo.id; sel.aiming = false; render(); } },
    }, [
      el('span', { class: 'ico', text: ammo.icon }),
      el('span', { class: 'lbl', text: t(ammo.label) }),
    ]);
    ammoRow.appendChild(btn);
  }
  bar.appendChild(ammoRow);

  bar.appendChild(el('div', { class: 'bat-ammo-hint', text: t(AMMO[sel.ammo].hint) }));

  const row = el('div', { class: 'bat-buttons' });
  const fireBlocked = B.usedBroadside ? t('bat_used')
    : !canFire(mine) ? (mine.structure.poudriere === 0 ? t('bat_no_powder') : t('bat_no_guns'))
    : B.distance > AMMO[sel.ammo].maxRange ? t('bat_out_of_range') : null;
  row.appendChild(btn(`${AMMO[sel.ammo].icon} ${t('bat_fire')}`, fireBlocked, () => {
    sel.aiming = !sel.aiming; sel.man = null; render();
  }, sel.aiming ? 'aiming' : 'primary'));

  row.appendChild(btn(`→ ${t('bat_close')}`,
    B.usedManoeuvre ? t('bat_used') : !canManoeuvre(mine) ? t('bat_dismasted') : B.distance === BOARD ? '—' : null,
    () => { manoeuvre(B, -1); render(); }));
  row.appendChild(btn(`← ${t('bat_open')}`,
    B.usedManoeuvre ? t('bat_used') : !canManoeuvre(mine) ? t('bat_dismasted') : B.distance === FAR ? '—' : null,
    () => { manoeuvre(B, +1); render(); }));
  row.appendChild(btn(`⚔ ${t('bat_board')}`,
    canBoard(B) ? null : t('range_bord_a_bord'),
    () => { board(B); render(); }, 'board'));
  row.appendChild(btn(`⏭ ${t('bat_end')}`, null, () => { endTurn(B); sel.aiming = false; render(); }, 'end'));
  bar.appendChild(row);

  if (sel.aiming) bar.appendChild(el('div', { class: 'bat-aiming', text: `🎯 ${t('bat_pick_room')}` }));
  return bar;
}

function btn(label, blockedReason, onClick, kind = '') {
  const b = el('button', {
    class: `bat-btn ${kind}${blockedReason ? ' off' : ''}`,
    title: blockedReason || '',
    on: { click: () => { if (!blockedReason) onClick(); } },
  }, [el('span', { text: label })]);
  if (blockedReason) {
    b.disabled = true;
    b.appendChild(el('span', { class: 'why', text: blockedReason }));
  }
  return b;
}

// ---------------------------------------------------------------------------

function layoutSea() {
  const seaEl = document.querySelector('.bat-sea');
  if (!seaEl) return;
  const availW = seaEl.clientWidth || window.innerWidth;
  const availH = seaEl.clientHeight || 360;
  const keelRoom = Math.round(availH * 0.13);
  seaEl.style.paddingBottom = `${keelRoom}px`;
  const maxH = availH - keelRoom;

  for (const [side, ship] of [['mine', B.ships.mine], ['theirs', B.ships.theirs]]) {
    const host = hosts[side];
    const block = host?.parentElement;
    if (!host || !block) continue;
    const gen = getGeneratedShip(ship.spriteSpec);
    const width = Math.floor(Math.min(availW * (side === 'mine' ? MINE_WIDTH : THEIRS_WIDTH), (maxH * gen.W) / gen.H));
    const height = (width * gen.H) / gen.W;
    host.style.width = `${width}px`;
    block.style.width = `${width}px`;
    block.style.marginBottom = `${-height * (1 - gen.waterY / gen.H)}px`;
  }
  hideCrampedLabels();
}

function hideCrampedLabels() {
  for (const host of [hosts.mine, hosts.theirs]) {
    if (!host) continue;
    for (const room of host.querySelectorAll('.deck-room')) {
      const label = room.querySelector('.deck-room-name');
      if (!label) continue;
      label.style.display = '';
      const fits = label.scrollWidth + 8 <= room.clientWidth && label.scrollHeight + 2 <= room.clientHeight;
      label.style.display = fits ? '' : 'none';
    }
  }
}

// The choice the whole fight is about, stated at the end: what a prize was
// worth against what a wreck was worth (§3).
function showOutcome() {
  if (document.querySelector('.bat-outcome')) return;
  const won = B.outcome === 'prize' || B.outcome === 'sunk';
  const gain = spoils(B);
  const title = { prize: t('bat_prize'), sunk: t('bat_sunk'), lost: t('bat_lost'), captured: t('bat_captured') }[B.outcome];
  const box = el('div', { class: `bat-outcome ${won ? 'won' : 'lost'}` }, [
    el('h2', { text: title }),
    el('p', { text: `${t('bat_spoils')} : ${gain.gold} 💰${gain.ship ? ' + le navire' : ''}` }),
    B.outcome === 'sunk'
      ? el('p', { class: 'warn', text: 'Une carcasse ne rapporte presque rien. Une prise vaut cinq fois plus.' })
      : null,
    el('div', { class: 'bat-outcome-btns' }, [
      el('button', { class: 'btn-level-1', text: '↺ Rejouer', on: { click: () => { startBattle(); document.querySelector('.bat-outcome')?.remove(); render(); } } }),
      el('button', { class: 'btn-level-4', text: '← Menu', on: { click: () => { B = null; go('title'); } } }),
    ]),
  ]);
  document.body.appendChild(box);
}

window.addEventListener('resize', () => { if (state.screen === 'bataille') layoutSea(); });

register('bataille', (opts) => { if (opts?.fresh || !B) startBattle(opts); render(); });

export { startBattle };
