// Combat rules — brief §4, §5. Pure functions over a plain state object: no
// DOM, no timers, no randomness. The screen renders what these return.
//
// THE POINT OF THE FIGHT (§3): you are not trying to sink the other ship, you
// are trying to take it. Sinking is quick and safe and pays almost nothing;
// taking it means dismasting precisely, thinning its crew, closing to board —
// and exposing yourself to do it. Every rule below exists to keep that choice
// alive, turn after turn.
//
// NON-NEGOTIABLE (§4.1): nothing here rolls dice. Given the same state and the
// same order, the result is always identical — a plan that fails is the
// player's fault, never the engine's. `test/battle.test.js` enforces it.

import { planFor, adjacent, route, routeCost, stepCost, SYSTEMS } from './shipPlans.js';

// --- Distance bands (§5.2), instead of a position grid ------------------------
// Closer is more dangerous and more profitable: you cannot board from afar.
export const RANGES = ['bord_a_bord', 'mousquet', 'canon', 'au_loin'];
export const BOARD = 0;
export const MUSKET = 1;
export const CANNON = 2;
export const FAR = 3;

// --- Munitions (§5.6) ---------------------------------------------------------
// Five shots that were interchangeable stat-modifiers; here each one does a
// different job, so choosing is a real decision. The same gun serves two
// opposite strategies.
export const AMMO = {
  boulet: {
    id: 'boulet', icon: '●', maxRange: CANNON,
    label: 'ammo_boulet', hint: 'ammo_boulet_hint',
  },
  chaine: {
    id: 'chaine', icon: '⛓', maxRange: CANNON,
    label: 'ammo_chaine', hint: 'ammo_chaine_hint',
  },
  mitraille: {
    id: 'mitraille', icon: '✳', maxRange: MUSKET,
    label: 'ammo_mitraille', hint: 'ammo_mitraille_hint',
  },
  explosif: {
    id: 'explosif', icon: '💥', maxRange: CANNON,
    label: 'ammo_explosif', hint: 'ammo_explosif_hint',
  },
  incendiaire: {
    id: 'incendiaire', icon: '🔥', maxRange: CANNON,
    label: 'ammo_incendiaire', hint: 'ammo_incendiaire_hint',
  },
};

export const MAX_FIRE = 3;

// ---------------------------------------------------------------------------
// Ship construction

export function makeShip({ name, hullClass, spriteSpec, facing = 1, mine = false, crew = [], hands }) {
  const plan = planFor(hullClass);
  const structure = {};
  for (const [key, room] of Object.entries(plan.rooms)) structure[key] = room.hp;
  return {
    name, hullClass, spriteSpec, facing, mine,
    structure,
    fire: {},
    crew: crew.map((c) => ({ ...c, hurt: c.hurt || 0, moving: null })),
    hands: hands ?? plan.minCrew,
    flooding: 0,
    struck: false,   // has surrendered — a prize waiting to be boarded
    sunk: false,
  };
}

export function planOf(ship) { return planFor(ship.hullClass); }

// --- Reading a ship's condition ----------------------------------------------

export function roomHp(ship, key) { return ship.structure[key] ?? 0; }
export function isWrecked(ship, key) { return roomHp(ship, key) <= 0; }

// Rooms serving a given system that still work.
export function liveRoomsFor(ship, system) {
  const plan = planOf(ship);
  return Object.entries(plan.rooms)
    .filter(([key, room]) => room.system === system && !isWrecked(ship, key))
    .map(([key]) => key);
}

// A gun deck fires only if the deck itself stands AND there is powder to serve
// it (§5.4: magazine at zero means not one more shot).
export function canFire(ship) {
  return liveRoomsFor(ship, 'canons').length > 0
    && liveRoomsFor(ship, 'munitions').length > 0;
}

// Without a mast the ship cannot change range — it can neither close nor run.
export function canManoeuvre(ship) {
  return liveRoomsFor(ship, 'voiles').length > 0;
}

// Men actually at their post and working. A man fighting a fire is not working
// (§5.5) — that is the whole tension: putting out the battery fire means not
// firing this turn.
export function workersIn(ship, roomKey) {
  return ship.crew.filter((c) => c.at === roomKey && !c.moving && c.hurt < 2);
}

// A man in the right room works well, in the wrong one badly (§6.2). No rule
// forbids anything; placement simply pays.
export function crewSkillIn(ship, roomKey) {
  const room = planOf(ship).rooms[roomKey];
  if (!room) return 0;
  const wanted = SYSTEMS[room.system].specialty;
  let total = 0;
  for (const man of workersIn(ship, roomKey)) {
    if (ship.fire[roomKey]) continue;            // busy fighting the fire
    total += man.specialty === wanted ? 2 : 1;
  }
  return total;
}

// Boarding strength (§6.4): the nameless hands are the mass, the named men the
// edge. Wounded men count for less, the maimed not at all.
export function boardingStrength(ship) {
  let total = ship.hands;
  for (const man of ship.crew) {
    if (man.hurt >= 2) continue;
    total += (man.specialty === 'melee' ? 3 : 1) * (man.hurt ? 1 : 2);
  }
  return total;
}

// Below her minimum working complement a ship is degraded — this is what makes
// a prize cost something to keep (§6.4).
export function isUndermanned(ship) {
  return ship.hands + ship.crew.filter((c) => c.hurt < 2).length < planOf(ship).minCrew;
}

// ---------------------------------------------------------------------------
// Orders

export function newBattle(mine, theirs, { distance = CANNON } = {}) {
  const state = {
    turn: 1,
    distance,
    phase: 'player',
    outcome: null,
    ships: { mine, theirs },
    intent: null,
    log: [],
    usedManoeuvre: false,
    usedBroadside: false,
  };
  state.intent = decideIntent(state);
  return state;
}

function say(state, key, data = {}) { state.log.push({ key, ...data }); }

// Ordering a move is free and unlimited (§5.7); the trip itself takes turns
// (§6.3). The man walks while the fight goes on around him.
export function orderMove(state, ship, man, to) {
  const plan = planOf(ship);
  if (!plan.rooms[to]) throw new Error(`unknown room "${to}"`);
  const path = route(plan, man.at, to);
  if (!path || path.length < 2) { man.moving = null; return null; }
  man.moving = { path, idx: 0, left: stepCost(plan, path[0], path[1]) };
  return path;
}

// One manoeuvre per turn (§5.7). Closing exposes you; breaking off gives up the
// prize. Without a mast you can do neither.
export function manoeuvre(state, dir) {
  if (state.usedManoeuvre) return false;
  const mine = state.ships.mine;
  if (!canManoeuvre(mine)) return false;
  const next = Math.max(BOARD, Math.min(FAR, state.distance + dir));
  if (next === state.distance) return false;
  state.distance = next;
  state.usedManoeuvre = true;
  say(state, dir < 0 ? 'log_closed' : 'log_opened', { range: RANGES[next] });
  return true;
}

// One broadside per turn (§5.7), deterministic (§4.1).
export function broadside(state, ammoId, targetRoom) {
  if (state.usedBroadside) return false;
  const ammo = AMMO[ammoId];
  const attacker = state.ships.mine;
  const target = state.ships.theirs;
  if (!ammo || !canFire(attacker)) return false;
  if (state.distance > ammo.maxRange) return false;
  if (!planOf(target).rooms[targetRoom]) return false;

  state.usedBroadside = true;
  applyShot(state, attacker, target, ammo, targetRoom);
  return true;
}

// The damage model. Everything here is arithmetic on the current state — the
// same order on the same board always gives the same result.
function applyShot(state, attacker, target, ammo, targetRoom) {
  // A well-served gun deck hits harder. This is where crew placement pays.
  const gunners = liveRoomsFor(attacker, 'canons')
    .reduce((n, key) => n + crewSkillIn(attacker, key), 0);
  const power = gunners >= 4 ? 2 : 1;
  const plan = planOf(target);
  const room = plan.rooms[targetRoom];

  switch (ammo.id) {
    case 'boulet':
      // The straight road to a wreck: structure, where you aim.
      hurtRoom(state, target, targetRoom, power);
      say(state, 'log_boulet', { room: room.name, amount: power });
      break;

    case 'chaine': {
      // The munition of the prize (§5.6): it only bites on rigging, and a
      // dismasted ship can neither run nor close — it is yours to board.
      const masts = liveRoomsFor(target, 'voiles');
      if (!masts.length) { say(state, 'log_chain_nothing'); break; }
      hurtRoom(state, target, masts[0], power);
      say(state, 'log_chain', { room: plan.rooms[masts[0]].name, amount: power });
      break;
    }

    case 'mitraille': {
      // Wounds men, spares the hull: this is how a boarding is prepared.
      const hit = target.crew.filter((c) => c.at === targetRoom && c.hurt < 2);
      for (const man of hit) man.hurt = Math.min(2, man.hurt + 1);
      const lost = Math.min(target.hands, 4 * power);
      target.hands -= lost;
      say(state, 'log_grape', { room: room.name, men: hit.length, hands: lost });
      break;
    }

    case 'explosif': {
      // Dispersed and imprecise: it also mauls a neighbouring room, which is
      // exactly how a prize gets sunk by accident.
      hurtRoom(state, target, targetRoom, power);
      const splash = adjacent(plan, targetRoom)[0];
      if (splash) hurtRoom(state, target, splash, 1);
      say(state, 'log_explosive', { room: room.name, splash: splash ? plan.rooms[splash].name : null });
      break;
    }

    case 'incendiaire':
      // The ONLY source of fire in the game (§4.3). Powerful, and the surest
      // way to lose the prize you were trying to take.
      target.fire[targetRoom] = Math.max(target.fire[targetRoom] || 0, 1);
      say(state, 'log_fire_set', { room: room.name });
      break;
  }
  checkOutcome(state);
}

function hurtRoom(state, ship, key, amount) {
  const before = roomHp(ship, key);
  if (before <= 0) return;
  ship.structure[key] = Math.max(0, before - amount);
  if (ship.structure[key] === 0) {
    const room = planOf(ship).rooms[key];
    say(state, 'log_room_down', { ship: ship.name, room: room.name, effect: SYSTEMS[room.system].atZero });
  }
}

// ---------------------------------------------------------------------------
// End of turn

export function endTurn(state) {
  if (state.phase === 'over') return state;
  resolveEnemy(state);
  tickShip(state, state.ships.mine);
  tickShip(state, state.ships.theirs);
  state.turn += 1;
  state.usedManoeuvre = false;
  state.usedBroadside = false;
  state.intent = decideIntent(state);
  checkOutcome(state);
  return state;
}

// Everything that happens to a ship between turns: men walking, fire growing,
// water rising. All of it deterministic and, for the fire, announced in advance.
function tickShip(state, ship) {
  advanceCrew(ship);
  advanceFire(state, ship);
  advanceFlooding(state, ship);
}

function advanceCrew(ship) {
  const plan = planOf(ship);
  for (const man of ship.crew) {
    if (!man.moving) continue;
    man.moving.left -= 1;
    if (man.moving.left > 0) continue;
    man.moving.idx += 1;
    const at = man.moving.path[man.moving.idx];
    man.at = at;
    // Walking through fire costs a wound (§6.3) — the geography is real.
    if (ship.fire[at]) man.hurt = Math.min(2, man.hurt + 1);
    if (man.moving.idx >= man.moving.path.length - 1) { man.moving = null; continue; }
    man.moving.left = stepCost(plan, at, man.moving.path[man.moving.idx + 1]);
  }
}

// Fire grows in an empty room and is beaten down by the men who stand in it —
// men who are then not doing their job (§5.5).
function advanceFire(state, ship) {
  const plan = planOf(ship);
  for (const key of Object.keys(ship.fire)) {
    const level = ship.fire[key];
    if (!level) continue;
    const fighters = ship.crew.filter((c) => c.at === key && !c.moving && c.hurt < 2).length;
    if (fighters > 0) {
      ship.fire[key] = Math.max(0, level - fighters);
      if (!ship.fire[key]) { delete ship.fire[key]; say(state, 'log_fire_out', { ship: ship.name, room: plan.rooms[key].name }); }
      continue;
    }
    hurtRoom(state, ship, key, 1);
    if (level < MAX_FIRE) { ship.fire[key] = level + 1; continue; }
    // At full intensity it spreads — to the magazine first, and it was
    // announced a turn ago (§5.5), so losing the ship is never a surprise.
    const next = spreadTarget(ship, key);
    if (next && !ship.fire[next]) {
      ship.fire[next] = 1;
      say(state, 'log_fire_spread', { ship: ship.name, room: plan.rooms[next].name });
    }
  }
  // Fire at full strength in the magazine ends the ship — and the prize.
  for (const key of liveRoomsFor(ship, 'munitions')) {
    if ((ship.fire[key] || 0) >= MAX_FIRE) {
      ship.sunk = true;
      say(state, 'log_magazine_blew', { ship: ship.name });
    }
  }
}

// Which room a fire will spread to next — magazine first, then the deepest
// neighbour. Exposed so the interface can warn a turn ahead.
export function spreadTarget(ship, key) {
  const plan = planOf(ship);
  const neighbours = adjacent(plan, key).filter((k) => !ship.fire[k] && !isWrecked(ship, k));
  if (!neighbours.length) return null;
  const magazine = neighbours.find((k) => plan.rooms[k].system === 'munitions');
  if (magazine) return magazine;
  return neighbours.sort((a, b) => (plan.rooms[b].y + plan.rooms[b].h) - (plan.rooms[a].y + plan.rooms[a].h))[0];
}

// Water in, water out. A holed bow lets the sea in every turn; only pumps that
// are BOTH standing and manned push it back — an unmanned pump does nothing,
// which is what makes "Les pompes, elles seules retiennent l'eau" true (§5.4).
//
// This is also what keeps sinking quick and safe (§3): put two roundshot
// through the bow of a ship whose carpenter is elsewhere and she founders on
// her own, at no risk to you — and pays you almost nothing.
export const FOUNDER_AT = 5;

function advanceFlooding(state, ship) {
  const plan = planOf(ship);
  const holes = Object.entries(plan.rooms)
    .filter(([key, room]) => room.system === 'coque' && isWrecked(ship, key)).length;
  const manned = liveRoomsFor(ship, 'pompes')
    .reduce((n, key) => n + crewSkillIn(ship, key), 0);
  if (!holes && !ship.flooding) return;

  // A breach lets in more than one man can bail out: one hole floods at 2,
  // and each pair of hands at the pumps holds back 1. So a single carpenter
  // slows a sinking without stopping it, and saving a holed ship means pulling
  // a second man off his own post to help him — the allocation decision that
  // makes the pumps interesting rather than a switch.
  const IN_PER_HOLE = 2;
  const before = ship.flooding;
  ship.flooding = Math.max(0, ship.flooding + holes * IN_PER_HOLE - Math.floor(manned / 2));
  if (before && !ship.flooding) say(state, 'log_leak_stopped', { ship: ship.name });
  if (ship.flooding >= FOUNDER_AT) {
    ship.sunk = true;
    say(state, 'log_foundered', { ship: ship.name });
  }
}

// ---------------------------------------------------------------------------
// The enemy: perfect information (§4.2). It announces manoeuvre, munition and
// the room it is aiming at, one full turn before it acts.

export function decideIntent(state) {
  const them = state.ships.theirs;
  const us = state.ships.mine;
  if (them.sunk || them.struck || state.phase === 'over') return null;

  // Dismasted and outmatched, it closes to board rather than be taken at leisure.
  if (!canManoeuvre(them) && state.distance <= MUSKET) {
    return { kind: 'board' };
  }
  // Out of range, it closes.
  if (state.distance > CANNON) return { kind: 'close' };
  if (!canFire(them)) return { kind: 'close' };

  // It aims at what hurts: the gun deck if we can still shoot, the mast if not.
  const plan = planOf(us);
  const batteries = liveRoomsFor(us, 'canons');
  const masts = liveRoomsFor(us, 'voiles');
  const targetRoom = batteries[0] || masts[0] || Object.keys(plan.rooms)[0];
  const ammoId = state.distance <= MUSKET && us.crew.some((c) => c.at === targetRoom)
    ? 'mitraille'
    : 'boulet';
  return { kind: 'fire', ammo: ammoId, room: targetRoom };
}

function resolveEnemy(state) {
  const intent = state.intent;
  const them = state.ships.theirs;
  if (!intent || them.sunk || them.struck) return;

  if (intent.kind === 'close') {
    if (canManoeuvre(them) && state.distance > BOARD) {
      state.distance -= 1;
      say(state, 'log_enemy_closed', { range: RANGES[state.distance] });
    }
    return;
  }
  if (intent.kind === 'board') { resolveBoarding(state, them, state.ships.mine); return; }
  if (intent.kind === 'fire') {
    if (!canFire(them) || state.distance > AMMO[intent.ammo].maxRange) return;
    applyShot(state, them, state.ships.mine, AMMO[intent.ammo], intent.room);
  }
}

// ---------------------------------------------------------------------------
// Boarding (§5.8) — only bord à bord, and it costs men on both sides.

export function canBoard(state) {
  const them = state.ships.theirs;
  return state.distance === BOARD && !them.sunk && !them.struck;
}

export function board(state) {
  if (!canBoard(state)) return false;
  resolveBoarding(state, state.ships.mine, state.ships.theirs);
  state.usedBroadside = true;
  state.usedManoeuvre = true;
  return true;
}

// Deterministic: the stronger side wins, and both sides bleed in proportion to
// how close it was. A prize is never free (§3).
function resolveBoarding(state, attacker, defender) {
  const att = boardingStrength(attacker);
  const def = boardingStrength(defender);
  const margin = att - def;

  const attLoss = Math.max(1, Math.round(def / 6));
  const defLoss = Math.max(1, Math.round(att / 5));
  attacker.hands = Math.max(0, attacker.hands - attLoss);
  defender.hands = Math.max(0, defender.hands - defLoss);

  // The nearest defenders take the brunt.
  const woundOne = (ship) => {
    const man = ship.crew.find((c) => c.hurt < 2);
    if (man) man.hurt += 1;
  };
  woundOne(attacker);
  woundOne(defender);

  if (margin > 0) {
    defender.struck = true;
    say(state, defender.mine ? 'log_we_were_taken' : 'log_prize_taken',
      { ship: defender.name, attLoss, defLoss });
  } else {
    say(state, 'log_boarding_repelled', { ship: defender.name, attLoss, defLoss });
  }
  checkOutcome(state);
}

// ---------------------------------------------------------------------------

export function checkOutcome(state) {
  const mine = state.ships.mine;
  const theirs = state.ships.theirs;
  if (state.outcome) return state.outcome;

  // A ship with nobody left to work her cannot fight on: she strikes. Without
  // this, throwing men at a boarding you cannot win bleeds the crew to nothing
  // and the fight simply never ends.
  for (const ship of [mine, theirs]) {
    if (!ship.sunk && !ship.struck && ship.hands <= 0) ship.struck = true;
  }

  if (mine.sunk) state.outcome = 'lost';
  else if (mine.struck) state.outcome = 'captured';
  else if (theirs.sunk) state.outcome = 'sunk';       // she is on the bottom: little pay
  else if (theirs.struck) state.outcome = 'prize';    // she is yours: the whole point

  if (state.outcome) state.phase = 'over';
  return state.outcome;
}

// What the fight is worth, so the choice between sinking and taking is priced
// rather than merely stated (§3).
export function spoils(state) {
  const theirs = state.ships.theirs;
  const base = { 1: 320, 2: 260, 3: 180, 4: 140, 5: 90, 6: 70 }[theirs.hullClass] || 100;
  if (state.outcome === 'prize') return { gold: base, ship: true };
  if (state.outcome === 'sunk') return { gold: Math.round(base * 0.15), ship: false };
  return { gold: 0, ship: false };
}

export { route, routeCost, adjacent };
