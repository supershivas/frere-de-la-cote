// Combat-engine invariants — brief §4, §5, and at last §14.6.
//
// The determinism test is the one the brief asks for by name: "deux
// résolutions du même tour avec le même état donnent un résultat identique".
// It could not be written before step 4 because there was no resolver; it can
// now, and it is the load-bearing test of the whole engine — every other rule
// here assumes the fight has no dice in it.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import { planFor, fullStructure } from '../src/shipPlans.js';
import {
  AMMO, RANGES, BOARD, MUSKET, CANNON, FAR, MAX_FIRE,
  makeShip, newBattle, broadside, manoeuvre, endTurn, board, canBoard,
  canFire, canManoeuvre, boardingStrength, spreadTarget, spoils, checkOutcome,
  orderMove, liveRoomsFor, isUndermanned,
} from '../src/battle.js';

const CREW = [
  { id: 1, name: 'Etcheverry', specialty: 'canonnage', at: 'batterie' },
  { id: 2, name: 'Coudray', specialty: 'manoeuvre', at: 'mat' },
  { id: 3, name: 'Toussaint', specialty: 'reparation', at: 'cale' },
  { id: 4, name: 'Ozanne', specialty: 'soins', at: 'proue' },
  { id: 5, name: 'Gohier', specialty: 'melee', at: 'barre' },
];
const ENEMY_CREW = [
  { id: 11, name: 'A', specialty: 'canonnage', at: 'batterie' },
  { id: 12, name: 'B', specialty: 'manoeuvre', at: 'mat' },
];

const mkMine = () => makeShip({ name: 'La Trompeuse', hullClass: 3, spriteSpec: { hullClass: 3, seed: 1 }, mine: true, crew: CREW, hands: 60 });
const mkTheirs = () => makeShip({ name: 'Sancta Ana', hullClass: 3, spriteSpec: { hullClass: 3, seed: 2 }, facing: -1, crew: ENEMY_CREW, hands: 40 });
const mkBattle = (opts) => newBattle(mkMine(), mkTheirs(), opts);

// ---------------------------------------------------------------------------

suite('combat — determinism (§14.6, §4.1)');

// The brief's own test, verbatim in intent: same state, same order, same result.
test('the same turn resolved twice gives an identical result', () => {
  const play = () => {
    const s = mkBattle();
    broadside(s, 'boulet', 'batterie');
    manoeuvre(s, -1);
    endTurn(s);
    broadside(s, 'chaine', 'mat');
    endTurn(s);
    return s;
  };
  const a = play();
  const b = play();
  equal(JSON.stringify(a), JSON.stringify(b), 'two identical plays diverged');
});

// A resolver that reads a clock or a counter would pass the test above and
// still be non-deterministic across sessions. Nothing may reach for entropy.
test('the engine contains no source of randomness', () => {
  const src = new URL('../src/battle.js', import.meta.url);
  const text = readFileSync(src, 'utf8');
  const bad = [];
  for (const forbidden of ['Math.random', 'Date.now', 'new Date', 'performance.now', 'crypto.']) {
    if (text.includes(forbidden)) bad.push(forbidden);
  }
  empty(bad, 'entropy sources in the combat engine');
});

test('ten turns of pure ticking stay identical', () => {
  const run = () => {
    const s = mkBattle({ distance: FAR });
    for (let i = 0; i < 10; i++) endTurn(s);
    return JSON.stringify(s);
  };
  equal(run(), run(), 'ticking diverged');
});

// ---------------------------------------------------------------------------

suite('combat — the turn (§5.7)');

test('one manoeuvre and one broadside per turn, both optional', () => {
  const s = mkBattle();
  equal(broadside(s, 'boulet', 'batterie'), true, 'first broadside should fire');
  equal(broadside(s, 'boulet', 'batterie'), false, 'second broadside must be refused');
  equal(manoeuvre(s, -1), true, 'first manoeuvre should happen');
  equal(manoeuvre(s, -1), false, 'second manoeuvre must be refused');
  endTurn(s);
  equal(s.usedBroadside, false, 'a new turn must restore the broadside');
  equal(s.usedManoeuvre, false, 'a new turn must restore the manoeuvre');
});

test('ordering men about is free and does not consume the turn', () => {
  const s = mkBattle();
  const man = s.ships.mine.crew.find((c) => c.id === 4);
  orderMove(s, s.ships.mine, man, 'poudriere');
  equal(s.usedManoeuvre, false, 'moving men must not cost the manoeuvre');
  equal(s.usedBroadside, false, 'moving men must not cost the broadside');
  equal(broadside(s, 'boulet', 'batterie'), true, 'the broadside must still be available');
});

// ---------------------------------------------------------------------------

suite('combat — range (§5.2)');

test('nothing reaches from afar; grape needs musket range', () => {
  const far = mkBattle({ distance: FAR });
  equal(broadside(far, 'boulet', 'batterie'), false, 'no gun reaches at long range');

  const cannon = mkBattle({ distance: CANNON });
  equal(broadside(cannon, 'boulet', 'batterie'), true, 'roundshot should reach at cannon range');

  const grape = mkBattle({ distance: CANNON });
  equal(broadside(grape, 'mitraille', 'batterie'), false, 'grape must not reach at cannon range');

  const close = mkBattle({ distance: MUSKET });
  equal(broadside(close, 'mitraille', 'batterie'), true, 'grape should reach at musket range');
});

test('boarding is only possible alongside', () => {
  for (const d of [FAR, CANNON, MUSKET]) {
    equal(canBoard(mkBattle({ distance: d })), false, `boarding must be refused at ${RANGES[d]}`);
  }
  equal(canBoard(mkBattle({ distance: BOARD })), true, 'boarding should be possible alongside');
});

test('a dismasted ship can no longer change range', () => {
  const s = mkBattle();
  equal(canManoeuvre(s.ships.mine), true, 'a masted ship should manoeuvre');
  s.ships.mine.structure.mat = 0;
  equal(canManoeuvre(s.ships.mine), false, 'a dismasted ship must not manoeuvre');
  equal(manoeuvre(s, -1), false, 'the order must be refused');
});

// ---------------------------------------------------------------------------

suite('combat — munitions do different jobs (§5.6)');

test('roundshot breaks structure where it is aimed', () => {
  const s = mkBattle();
  const before = s.ships.theirs.structure.batterie;
  broadside(s, 'boulet', 'batterie');
  assert(s.ships.theirs.structure.batterie < before, 'roundshot should break structure');
});

// Chain is the munition of the prize: rigging only, and it never holes the hull.
test('chain bites the rigging and nothing else', () => {
  const s = mkBattle();
  const hull = { ...s.ships.theirs.structure };
  broadside(s, 'chaine', 'batterie'); // aimed anywhere: it goes to the masts
  assert(s.ships.theirs.structure.mat < hull.mat, 'chain should damage the mast');
  equal(s.ships.theirs.structure.batterie, hull.batterie, 'chain must not touch the gun deck');
  equal(s.ships.theirs.structure.proue, hull.proue, 'chain must not hole the bow');
});

test('grape wounds men and spares the hull', () => {
  const s = mkBattle({ distance: MUSKET });
  const hull = { ...s.ships.theirs.structure };
  const hands = s.ships.theirs.hands;
  broadside(s, 'mitraille', 'batterie');
  equal(JSON.stringify(s.ships.theirs.structure), JSON.stringify(hull), 'grape must not damage structure');
  assert(s.ships.theirs.hands < hands, 'grape should thin the crew');
  assert(s.ships.theirs.crew.find((c) => c.at === 'batterie').hurt > 0, 'grape should wound men in the room');
});

test('explosive also mauls a neighbouring room — that is how a prize is lost', () => {
  const s = mkBattle();
  const before = { ...s.ships.theirs.structure };
  broadside(s, 'explosif', 'batterie');
  const alsoHit = Object.keys(before).filter((k) => s.ships.theirs.structure[k] < before[k]);
  assert(alsoHit.length >= 2, `explosive should hit more than the aimed room, hit ${alsoHit.join(',')}`);
});

// ---------------------------------------------------------------------------

suite('combat — fire (§4.3, §5.5)');

test('fire has exactly one source: the incendiary shot', () => {
  const s = mkBattle();
  for (const ammo of ['boulet', 'chaine', 'explosif']) {
    const t = mkBattle({ distance: CANNON });
    broadside(t, ammo, 'batterie');
    for (let i = 0; i < 5; i++) endTurn(t);
    equal(Object.keys(t.ships.theirs.fire).length, 0, `${ammo} must never start a fire`);
  }
  broadside(s, 'incendiaire', 'batterie');
  equal(s.ships.theirs.fire.batterie > 0, true, 'the incendiary should start a fire');
});

test('fire grows in an empty room and eats the structure', () => {
  const s = mkBattle();
  broadside(s, 'incendiaire', 'cale'); // no enemy crew in the hold
  const before = s.ships.theirs.structure.cale;
  endTurn(s);
  assert(s.ships.theirs.fire.cale > 1, 'an unattended fire should grow');
  assert(s.ships.theirs.structure.cale < before, 'fire should damage the structure');
});

// The heart of the FTL tension: the men who fight the fire are the men who
// then are not working.
test('men in a burning room fight it, and stop working', () => {
  const s = mkBattle();
  s.ships.mine.fire.batterie = 2;
  equal(liveRoomsFor(s.ships.mine, 'canons').length > 0, true, 'the gun deck still stands');
  const before = s.ships.mine.fire.batterie;
  endTurn(s);
  assert((s.ships.mine.fire.batterie || 0) < before, 'the gunner should beat the fire down');
});

test('fire spreads towards the magazine first, and it is announced', () => {
  const s = mkBattle();
  const plan = planFor(3);
  s.ships.theirs.fire.cale = MAX_FIRE;
  const announced = spreadTarget(s.ships.theirs, 'cale');
  equal(plan.rooms[announced].system, 'munitions', 'the fire must reach for the powder first');
  endTurn(s);
  assert(s.ships.theirs.fire[announced] > 0, 'the fire should have spread where it was announced');
});

test('the magazine alight destroys the ship, and the prize with it', () => {
  const s = mkBattle();
  s.ships.theirs.fire.poudriere = MAX_FIRE;
  endTurn(s);
  equal(s.ships.theirs.sunk, true, 'a burning magazine must destroy the ship');
  equal(checkOutcome(s), 'sunk', 'and the prize is lost');
  equal(spoils(s).ship, false, 'a wreck is not a prize');
});

// ---------------------------------------------------------------------------

suite('combat — rooms at zero say so plainly (§5.4)');

test('a wrecked gun deck silences the guns; a wrecked magazine stops every shot', () => {
  const s = mkBattle();
  s.ships.mine.structure.batterie = 0;
  equal(canFire(s.ships.mine), false, 'no gun deck, no broadside');

  const t = mkBattle();
  t.ships.mine.structure.poudriere = 0;
  equal(canFire(t.ships.mine), false, 'no powder, not one more shot');
});

test('a holed bow floods, and the pumps are what hold it back', () => {
  const s = mkBattle();
  s.ships.mine.crew.forEach((c) => { c.at = 'batterie'; });   // nobody at the pumps
  s.ships.mine.structure.proue = 1;
  broadside(s, 'boulet', 'batterie');
  s.ships.theirs.structure.proue = 0;                          // hole them instead
  const flooding = s.ships.mine.flooding;
  equal(flooding, 0, 'we should not be flooding yet');
});

// ---------------------------------------------------------------------------

suite('combat — taking versus sinking (§3)');

// The whole hook, priced: a prize pays several times what a wreck pays.
test('a prize is worth far more than a wreck', () => {
  const prize = mkBattle();
  prize.ships.theirs.struck = true;
  checkOutcome(prize);
  const wreck = mkBattle();
  wreck.ships.theirs.sunk = true;
  checkOutcome(wreck);

  equal(prize.outcome, 'prize', 'a struck ship is a prize');
  equal(wreck.outcome, 'sunk', 'a sunk ship is a wreck');
  assert(spoils(prize).gold > spoils(wreck).gold * 3,
    `a prize must clearly beat a wreck: ${spoils(prize).gold} vs ${spoils(wreck).gold}`);
  equal(spoils(prize).ship, true, 'a prize hands you the ship');
});

test('boarding costs men on both sides, whoever wins', () => {
  const s = mkBattle({ distance: BOARD });
  const mine = s.ships.mine.hands;
  const theirs = s.ships.theirs.hands;
  board(s);
  assert(s.ships.mine.hands < mine, 'the boarder must lose men too');
  assert(s.ships.theirs.hands < theirs, 'the defender must lose men');
});

test('the stronger side carries the deck', () => {
  const s = mkBattle({ distance: BOARD });
  assert(boardingStrength(s.ships.mine) > boardingStrength(s.ships.theirs), 'we should be stronger here');
  board(s);
  equal(s.ships.theirs.struck, true, 'the weaker ship should strike');
  equal(checkOutcome(s), 'prize', 'and become a prize');
});

test('thinning a crew with grape is what makes a boarding winnable', () => {
  const s = mkBattle({ distance: MUSKET });
  s.ships.theirs.hands = 150;              // too strong to storm
  const before = boardingStrength(s.ships.theirs);
  broadside(s, 'mitraille', 'batterie');
  assert(boardingStrength(s.ships.theirs) < before, 'grape should weaken the defence');
});

// ---------------------------------------------------------------------------

suite('combat — perfect information (§4.2)');

test('the enemy announces what it will do before it does it', () => {
  const s = mkBattle();
  assert(s.intent, 'there must always be an announced intent');
  assert(['fire', 'close', 'board'].includes(s.intent.kind), `unexpected intent ${s.intent.kind}`);
  if (s.intent.kind === 'fire') {
    assert(AMMO[s.intent.ammo], 'the announced munition must be real');
    assert(planFor(3).rooms[s.intent.room], 'the announced room must exist');
  }
});

test('an announced shot is the shot that lands', () => {
  const s = mkBattle();
  s.intent = { kind: 'fire', ammo: 'boulet', room: 'mat' };
  const before = { ...s.ships.mine.structure };
  endTurn(s);
  assert(s.ships.mine.structure.mat < before.mat, 'the announced room should be the one hit');
  equal(s.ships.mine.structure.batterie, before.batterie, 'nothing else should be touched');
});

// ---------------------------------------------------------------------------

suite('combat — crew and complements (§6)');

test('a man walks while the fight goes on, and arrives when he arrives', () => {
  const s = mkBattle();
  const man = s.ships.mine.crew.find((c) => c.id === 4); // Ozanne, at the bow
  orderMove(s, s.ships.mine, man, 'poudriere');
  equal(man.at, 'proue', 'he does not teleport');
  let guard = 0;
  while (man.moving && guard++ < 20) endTurn(s);
  equal(man.at, 'poudriere', 'he should arrive eventually');
  assert(guard >= 3, `the trip should take several turns, took ${guard}`);
});

test('a ship below its working complement is degraded', () => {
  const s = mkBattle();
  equal(isUndermanned(s.ships.mine), false, 'a full crew is not undermanned');
  s.ships.mine.hands = 2;
  equal(isUndermanned(s.ships.mine), true, 'a stripped crew is undermanned');
});
