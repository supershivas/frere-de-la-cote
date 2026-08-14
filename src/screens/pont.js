// Deck-plan harness — steps 2 and 3 of the chantier, made playable so the
// exit conditions can actually be judged: "un navire s'affiche avec son plan
// lisible" and "un homme traverse trois salles et ça se voit".
//
// This is a harness, not the combat screen. Step 4 builds the fight on top of
// `deckView.js`; step 7 does the interface pass. Nothing here is meant to
// survive as final UI, so it stays deliberately plain — but the ship is the
// screen, and the panels stay out of its way.

import { el, mount } from '../ui.js';
import { t } from '../i18n.js';
import { register, go } from '../nav.js';
import { state, buildSpriteSpec } from '../state.js';
import { planFor, fullStructure, routeCost, route, SYSTEMS } from '../shipPlans.js';
import { renderDeck, walk, reachFrom } from '../deckView.js';
import { getGeneratedShip } from '../sprites.js';

// Starting crew of brief §6.2 — five men, one specialty each, no player avatar.
const CREW = [
  { id: 1, name: 'Etcheverry', role: 'canonnier',         specialty: 'canonnage',  at: 'batterie' },
  { id: 2, name: 'Coudray',    role: "maître d'équipage", specialty: 'manoeuvre',  at: 'mat' },
  { id: 3, name: 'Toussaint',  role: 'charpentier',       specialty: 'reparation', at: 'cale' },
  { id: 4, name: 'Ozanne',     role: 'chirurgien',        specialty: 'soins',      at: 'proue' },
  { id: 5, name: 'Gohier',     role: 'matelot',           specialty: 'melee',      at: 'barre' },
];

const ENEMY_CREW = [
  { id: 101, name: '?', specialty: 'canonnage', at: 'batterieBasse' },
  { id: 102, name: '?', specialty: 'canonnage', at: 'batterieBasse' },
  { id: 103, name: '?', specialty: 'manoeuvre', at: 'mat' },
  { id: 104, name: '?', specialty: 'melee',     at: 'gaillard' },
  { id: 105, name: '?', specialty: 'soins',     at: 'infirmerie' },
];

// FTL proportions: your own ship gets the room, the enemy is read at a glance.
const MINE_WIDTH = 0.56;
const THEIRS_WIDTH = 0.34;

let S = null;
let hosts = { mine: null, theirs: null };

function freshState() {
  const mine = {
    name: 'La Trompeuse',
    hullClass: 3,
    facing: 1,
    mine: true,
    spriteSpec: buildSpriteSpec(
      { hullClass: 3, hullShape: 'auto', sailsPerMast: 2, jibs: 1, wear: 0 }, 'free_pirates', 42),
    structure: fullStructure(planFor(3)),
    fire: {},
    crew: CREW.map((c) => ({ ...c, hurt: 0 })),
  };
  const theirs = {
    name: 'Sancta Ana',
    hullClass: 1,
    facing: -1,
    mine: false,
    spriteSpec: buildSpriteSpec(
      { hullClass: 1, hullShape: 'auto', sailsPerMast: 3, jibs: 2, wear: 1 }, 'espagnole', 7),
    structure: fullStructure(planFor(1)),
    fire: {},
    crew: ENEMY_CREW.map((c) => ({ ...c })),
  };
  mine.structure.mat = 2;
  mine.structure.barre = 1;
  theirs.structure.mat = 0;
  theirs.structure.batterieHaute = 1;
  theirs.fire.poudriere = 2;

  return { mine, theirs, selectedId: null, turn: 1, walking: false, log: null };
}

function render() {
  S ||= freshState();
  state.screen = 'pont';

  const sea = el('div', { class: 'pont-sea' }, [shipBlock(S.mine), shipBlock(S.theirs)]);
  const root = el('div', { class: 'screen pont-screen' }, [
    sea,
    detailPanel(),
    crewBar(),
    el('div', { class: 'pont-controls' }, [
      el('button', { class: 'btn-level-4', text: '↺ Réinitialiser', on: { click: () => { S = freshState(); render(); } } }),
      el('button', { class: 'btn-level-4', text: '🔥 Feu à la batterie', on: { click: lightFire } }),
      el('button', { class: 'btn-level-4', text: '← Menu', on: { click: () => go('title') } }),
    ]),
  ]);
  mount(root);
  layoutSea();
}

function shipBlock(ship) {
  const plan = planFor(ship.hullClass);
  const wrap = el('div', { class: 'pont-ship' });
  wrap.dataset.side = ship.mine ? 'mine' : 'theirs';
  wrap.appendChild(el('div', { class: 'pont-cap' }, [
    el('div', { text: `${ship.name} · ${Object.keys(plan.rooms).length} salles` }),
  ]));
  const host = el('div');
  wrap.appendChild(host);
  hosts[ship.mine ? 'mine' : 'theirs'] = host;

  renderDeck(host, ship, {
    scale: 8,
    selectedId: ship.mine ? S.selectedId : null,
    onPickMan: (man) => { if (!S.walking) { S.selectedId = S.selectedId === man.id ? null : man.id; render(); } },
    onPickRoom: (key) => onRoom(key, ship),
  });
  return wrap;
}

// Both hulls float on the same sea: each ship is pushed down by the part of it
// that lies under its own waterline, so the two waterlines land on one line
// whatever their sizes.
function layoutSea() {
  const seaEl = document.querySelector('.pont-sea');
  if (!seaEl) return;
  const availW = seaEl.clientWidth || window.innerWidth;
  const availH = seaEl.clientHeight || 400;
  // Keels show below the shared line, so the usable height is what is left.
  const keelRoom = Math.round(availH * 0.14);
  seaEl.style.paddingBottom = `${keelRoom}px`;
  const maxH = availH - keelRoom;

  for (const [side, ship] of [['mine', S.mine], ['theirs', S.theirs]]) {
    const host = hosts[side];
    const block = host?.parentElement;
    if (!host || !block) continue;
    const gen = getGeneratedShip(ship.spriteSpec);
    // Fit by width AND by height: a ship whose masts run off the top of the
    // screen is not a ship the player can read.
    const share = side === 'mine' ? MINE_WIDTH : THEIRS_WIDTH;
    const width = Math.floor(Math.min(availW * share, (maxH * gen.W) / gen.H));
    const height = (width * gen.H) / gen.W;
    host.style.width = `${width}px`;
    block.style.width = `${width}px`;
    // Push the ship down by the part of it that lies below its own waterline,
    // so both waterlines land on the same line whatever the two scales are.
    block.style.marginBottom = `${-height * (1 - gen.waterY / gen.H)}px`;
  }

  hideCrampedLabels();
}

// A label wider than its room is worse than no label: it spills over the
// neighbouring rooms and turns the plan into noise. The name is always in the
// detail panel, so dropping it here costs nothing.
function hideCrampedLabels() {
  for (const host of [hosts.mine, hosts.theirs]) {
    if (!host) continue;
    for (const room of host.querySelectorAll('.deck-room')) {
      const label = room.querySelector('.deck-room-name');
      if (!label) continue;
      label.style.display = '';
      const fits = label.scrollWidth + 8 <= room.clientWidth
        && label.scrollHeight + 2 <= room.clientHeight;
      label.style.display = fits ? '' : 'none';
    }
  }
}

function onRoom(key, ship) {
  const man = S.selectedId && ship.mine ? ship.crew.find((c) => c.id === S.selectedId) : null;
  if (!man || S.walking) return describeRoom(key, ship);
  if (man.at === key) { S.selectedId = null; return render(); }
  sendMan(ship, man, key);
}

// Step 3, the whole point: the man physically crosses the rooms in between,
// one per step, and crossing a fire costs him a wound. The token is moved
// rather than rebuilt, so the walk animates instead of teleporting.
function sendMan(ship, man, to) {
  const plan = planFor(ship.hullClass);
  const host = hosts[ship.mine ? 'mine' : 'theirs'];
  S.walking = true;
  S.selectedId = null;
  // Drop the selection highlight without rebuilding the tokens mid-walk.
  host.querySelectorAll('.deck-room').forEach((n) => n.classList.remove('reachable', 'here'));
  host.querySelector(`[data-man="${man.id}"]`)?.classList.remove('selected');

  const burns = [];
  walk(host, ship, man, to, {
    onStep: (roomKey) => {
      if (ship.fire[roomKey]) {
        man.hurt = Math.min(2, man.hurt + 1);
        burns.push(t(plan.rooms[roomKey].name));
        host.querySelector(`[data-man="${man.id}"]`)?.classList.add('hurt');
      }
    },
    onArrive: (taken, cost) => {
      S.walking = false;
      S.turn += cost;
      const rooms = taken.length - 1;
      const via = taken.slice(1, -1).map((k) => t(plan.rooms[k].name));
      let line = `${man.name} rejoint ${t(plan.rooms[to].name)} — ${rooms} salle${rooms > 1 ? 's' : ''}, ${cost} tour${cost > 1 ? 's' : ''}`;
      if (via.length) line += ` (par ${via.join(', ')})`;
      if (cost > rooms) line += ' · échelle empruntée';
      if (burns.length) line += ` · brûlé en passant par ${burns.join(', ')}`;
      S.log = { text: line, warn: burns.length > 0 };
      render();
    },
  });
}

function describeRoom(key, ship) {
  const plan = planFor(ship.hullClass);
  const room = plan.rooms[key];
  const hp = ship.structure[key] ?? room.hp;
  const sys = SYSTEMS[room.system];
  const men = ship.crew.filter((c) => c.at === key);
  S.log = {
    text: `${t(room.name)} — structure ${hp}/${room.hp}${room.open ? ' · pont découvert' : ''}`,
    detail: hp <= 0 ? t(sys.atZero) : `Sert à : ${t(`spec_${sys.specialty}`)}. À zéro : ${t(sys.atZero)}`,
    men: ship.mine ? (men.map((m) => m.name).join(', ') || 'personne') : `${men.length} homme(s)`,
    warn: hp <= 0 || !!ship.fire[key],
  };
  render();
}

function detailPanel() {
  // A fixed panel, not a floating tooltip: hover-only interfaces were tried and
  // discarded because they do not work under a finger (brief §9).
  const box = el('div', { class: 'pont-panel' });
  if (!S.log) {
    box.appendChild(el('h4', { text: `Cliquez un homme, puis une salle · tour ${S.turn}` }));
    box.appendChild(el('div', { text: "Il empruntera les passages existants, salle par salle. Une échelle coûte deux tours, un déplacement sur le même pont un seul." }));
    return box;
  }
  box.appendChild(el('h4', { text: `${S.log.text} · tour ${S.turn}` }));
  if (S.log.detail) box.appendChild(el('div', { class: S.log.warn ? 'warn' : '', text: S.log.detail }));
  if (S.log.men) box.appendChild(el('div', { text: `Présents : ${S.log.men}` }));
  return box;
}

function crewBar() {
  const bar = el('div', { class: 'pont-crew' });
  const selected = S.selectedId ? S.mine.crew.find((c) => c.id === S.selectedId) : null;
  const reach = selected ? reachFrom(S.mine, selected) : null;
  const plan = planFor(S.mine.hullClass);
  for (const man of S.mine.crew) {
    const card = el('div', {
      class: `pont-card${S.selectedId === man.id ? ' selected' : ''}`,
      on: { click: () => { if (!S.walking) { S.selectedId = S.selectedId === man.id ? null : man.id; render(); } } },
    });
    card.appendChild(el('b', { text: man.name }));
    card.appendChild(el('span', { class: 'role', text: t(`spec_${man.specialty}`) }));
    card.appendChild(el('span', {
      class: `loc${man.hurt ? ' hurt' : ''}`,
      text: `${t(plan.rooms[man.at].name)}${man.hurt ? ' · blessé' : ''}`,
    }));
    bar.appendChild(card);
  }
  return bar;
}

function lightFire() {
  S.mine.fire.batterie = Math.min(3, (S.mine.fire.batterie || 0) + 1);
  S.log = {
    text: 'Le feu prend dans la batterie.',
    detail: 'Traverser une salle en feu coûte une blessure (brief §6.3).',
    warn: true,
  };
  render();
}

window.addEventListener('resize', () => { if (state.screen === 'pont') layoutSea(); });

register('pont', () => { S ||= freshState(); render(); });
