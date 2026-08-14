// Deck-plan harness — steps 2 and 3 of the chantier, made playable so the
// exit conditions can actually be judged: "un navire s'affiche avec son plan
// lisible" and "un homme traverse trois salles et ça se voit".
//
// This is a harness, not the combat screen. Step 4 builds the fight on top of
// `deckView.js`; step 7 does the interface pass. Nothing here is meant to
// survive as final UI, so it stays deliberately plain.

import { el, mount } from '../ui.js';
import { t } from '../i18n.js';
import { register, go } from '../nav.js';
import { state, buildSpriteSpec } from '../state.js';
import { planFor, fullStructure, SYSTEMS } from '../shipPlans.js';
import { renderDeck, walk, reachFrom } from '../deckView.js';

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

let S = null;

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
  // A little damage so the states are legible at a glance, and one fire so the
  // "cross a burning room and it costs you" rule can be tried.
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
  const root = el('div', { class: 'screen pont-screen pattern-wood' }, [
    el('div', { class: 'pont-cap', text: 'ÉTAPE 2-3 · PLAN DE PONT ET DÉPLACEMENT D\'ÉQUIPAGE' }),
    el('div', { class: 'pont-duo' }, [shipBlock(S.mine), shipBlock(S.theirs)]),
    detailPanel(),
    crewBar(),
    el('div', { class: 'pont-controls' }, [
      el('button', { class: 'btn-level-4', text: '↺ Réinitialiser', on: { click: () => { S = freshState(); render(); } } }),
      el('button', { class: 'btn-level-4', text: '🔥 Mettre le feu à la batterie', on: { click: lightFire } }),
      el('button', { class: 'btn-level-4', text: '← Menu', on: { click: () => go('title') } }),
    ]),
  ]);
  mount(root);
}

function shipBlock(ship) {
  const plan = planFor(ship.hullClass);
  const wrap = el('div', { class: 'pont-ship' }, [
    el('div', { class: 'pont-cap' }, [
      el('div', { text: ship.name }),
      el('div', { text: `${Object.keys(plan.rooms).length} salles · ${plan.minCrew}/${plan.maxCrew} hommes` }),
    ]),
  ]);
  const host = el('div');
  wrap.appendChild(host);
  renderDeck(host, ship, {
    scale: ship.hullClass <= 2 ? 9 : 11,
    selectedId: ship.mine ? S.selectedId : null,
    onPickMan: (man) => { if (!S.walking) { S.selectedId = S.selectedId === man.id ? null : man.id; render(); } },
    onPickRoom: (key) => onRoom(key, ship),
  });
  return wrap;
}

function onRoom(key, ship) {
  const man = S.selectedId && ship.mine ? ship.crew.find((c) => c.id === S.selectedId) : null;
  if (!man || S.walking) return describeRoom(key, ship);
  if (man.at === key) { S.selectedId = null; return render(); }
  sendMan(ship, man, key);
}

// Step 3, the whole point: the man physically crosses the rooms in between,
// one per step, and crossing a fire costs him a wound.
function sendMan(ship, man, to) {
  const plan = planFor(ship.hullClass);
  S.walking = true;
  S.selectedId = null;
  const burns = [];

  const path = walk(ship, man, to, {
    onStep: (roomKey) => {
      if (ship.fire[roomKey]) {
        man.hurt = Math.min(2, man.hurt + 1);
        burns.push(t(plan.rooms[roomKey].name));
      }
      render();
    },
    onArrive: (taken) => {
      S.walking = false;
      const steps = taken.length - 1;
      S.turn += steps;
      const via = taken.slice(1, -1).map((k) => t(plan.rooms[k].name));
      let line = `${man.name} rejoint ${t(plan.rooms[to].name)} — ${steps} salle${steps > 1 ? 's' : ''} traversée${steps > 1 ? 's' : ''}`;
      if (via.length) line += ` (par ${via.join(', ')})`;
      if (burns.length) line += ` · brûlé en passant par ${burns.join(', ')}`;
      S.log = { text: line, warn: burns.length > 0 };
      render();
    },
  });

  if (!path) {
    S.walking = false;
    S.log = { text: `Aucun passage ne mène à ${t(plan.rooms[to].name)}.`, warn: true };
    render();
  }
}

function describeRoom(key, ship) {
  const plan = planFor(ship.hullClass);
  const room = plan.rooms[key];
  const hp = ship.structure[key] ?? room.hp;
  const sys = SYSTEMS[room.system];
  const men = ship.crew.filter((c) => c.at === key);
  S.log = {
    room: key, ship,
    text: `${t(room.name)} — structure ${hp}/${room.hp}`,
    detail: hp <= 0 ? t(sys.atZero) : `Sert à : ${t(`spec_${sys.specialty}`)}. À zéro : ${t(sys.atZero)}`,
    men: ship.mine ? men.map((m) => m.name).join(', ') || 'personne' : `${men.length} homme(s)`,
    warn: hp <= 0 || !!ship.fire[key],
  };
  render();
}

function detailPanel() {
  // A fixed panel, not a floating tooltip: hover-only interfaces were tried and
  // discarded because they do not work under a finger (brief §9).
  const box = el('div', { class: 'pont-panel' });
  if (!S.log) {
    box.appendChild(el('h4', { text: 'Cliquez un homme, puis une salle' }));
    box.appendChild(el('div', { text: 'Il empruntera les passages existants, salle par salle. Toutes les salles ne communiquent pas.' }));
    box.appendChild(el('div', { text: `Tour ${S.turn}` }));
    return box;
  }
  box.appendChild(el('h4', { text: S.log.text }));
  if (S.log.detail) box.appendChild(el('div', { class: S.log.warn ? 'warn' : '', text: S.log.detail }));
  if (S.log.men) box.appendChild(el('div', { text: `Présents : ${S.log.men}` }));
  box.appendChild(el('div', { text: `Tour ${S.turn}` }));
  return box;
}

function crewBar() {
  const bar = el('div', { class: 'pont-crew' });
  const reach = S.selectedId
    ? reachFrom(S.mine, S.mine.crew.find((c) => c.id === S.selectedId))
    : null;
  const plan = planFor(S.mine.hullClass);
  for (const man of S.mine.crew) {
    const card = el('div', {
      class: `pont-card${S.selectedId === man.id ? ' selected' : ''}`,
      on: { click: () => { if (!S.walking) { S.selectedId = S.selectedId === man.id ? null : man.id; render(); } } },
    });
    card.appendChild(el('b', { text: man.name }));
    card.appendChild(el('span', { class: 'role', text: `${man.role} · ${t(`spec_${man.specialty}`)}` }));
    const where = t(plan.rooms[man.at].name);
    const hurt = man.hurt ? ' · blessé' : '';
    const dist = reach && S.selectedId !== man.id ? '' : '';
    card.appendChild(el('span', {
      class: `loc${man.hurt ? ' hurt' : ''}`,
      text: `${where}${hurt}${dist}`,
    }));
    bar.appendChild(card);
  }
  return bar;
}

function lightFire() {
  S.mine.fire.batterie = Math.min(3, (S.mine.fire.batterie || 0) + 1);
  S.log = { text: 'Le feu prend dans la batterie.', detail: 'Traverser une salle en feu coûte une blessure (brief §6.3).', warn: true };
  render();
}

register('pont', () => { S ||= freshState(); render(); });
