// Deck-plan invariants — brief §14, the tests named as priorities.
//
// "Ce sont les fautes qui ne se voient pas à la lecture." Every check below is
// one the eye slides over: a key that exists in one table and not the other,
// a passage to a room that was renamed, a room sealed off from the rest of the
// ship, two rooms drawn on top of each other.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import {
  SPECIALTIES, SYSTEMS, planFor, allPlans,
  adjacent, route, routeCost, isLadder, stepCost, fullStructure, disabledSystems,
} from '../src/shipPlans.js';

const PLANS = allPlans();
const readJson = (p) => JSON.parse(readFileSync(new URL(p, new URL('../', import.meta.url)), 'utf8'));
const LOC = { fr: readJson('locales/fr.json'), en: readJson('locales/en.json') };

// ---------------------------------------------------------------------------

suite('deck plans — key coherence (§14.1)');

// The §13 bug, made impossible: rooms["coque"] read a *system* name where a
// *room* key belonged. The two vocabularies must stay disjoint.
test('no system name is usable as a room key', () => {
  const systemNames = new Set(Object.keys(SYSTEMS));
  const bad = [];
  for (const plan of PLANS) {
    for (const key of Object.keys(plan.rooms)) {
      if (systemNames.has(key)) {
        bad.push(`${plan.id}: room key "${key}" is also a system name`);
      }
    }
  }
  empty(bad, 'room keys colliding with system names');
});

test('every room names a system that exists', () => {
  const bad = [];
  for (const plan of PLANS) {
    for (const [key, room] of Object.entries(plan.rooms)) {
      if (!room.system) bad.push(`${plan.id}.${key} declares no system`);
      else if (!SYSTEMS[room.system]) bad.push(`${plan.id}.${key} → system "${room.system}"`);
    }
  }
  empty(bad, 'dangling system references');
});

test('every system calls on a real specialty', () => {
  const bad = [];
  for (const [name, sys] of Object.entries(SYSTEMS)) {
    if (!SPECIALTIES.includes(sys.specialty)) {
      bad.push(`system "${name}" → specialty "${sys.specialty}"`);
    }
  }
  empty(bad, 'systems calling on unknown specialties');
});

// A room with no plain-language consequence would leave the player guessing
// what breaking it actually does (brief §4.6, §5.4).
test('every system states what happens at zero', () => {
  const bad = Object.entries(SYSTEMS)
    .filter(([, sys]) => !sys.atZero)
    .map(([name]) => `system "${name}" has no atZero`);
  empty(bad, 'systems with no stated consequence');
});

// Room labels and consequences are i18n keys, stored as plain strings rather
// than t() calls, so the data suite's t()-grep cannot see them. Without this
// check the plan would render raw keys on screen at step 2.
test('every room label and consequence is translated', () => {
  const bad = [];
  for (const plan of PLANS) {
    for (const [key, room] of Object.entries(plan.rooms)) {
      for (const [lang, table] of Object.entries(LOC)) {
        if (!(room.name in table)) bad.push(`${plan.id}.${key} → "${room.name}" missing from ${lang}`);
      }
    }
  }
  for (const [name, sys] of Object.entries(SYSTEMS)) {
    for (const [lang, table] of Object.entries(LOC)) {
      if (!(sys.atZero in table)) bad.push(`system "${name}" → "${sys.atZero}" missing from ${lang}`);
    }
  }
  for (const spec of SPECIALTIES) {
    for (const [lang, table] of Object.entries(LOC)) {
      if (!(`spec_${spec}` in table)) bad.push(`specialty "${spec}" → "spec_${spec}" missing from ${lang}`);
    }
  }
  empty(bad, 'untranslated plan keys');
});

// ---------------------------------------------------------------------------

suite('deck plans — passages (§14.2)');

test('every passage links two existing rooms', () => {
  const bad = [];
  for (const plan of PLANS) {
    plan.doors.forEach(([a, b], i) => {
      if (!plan.rooms[a]) bad.push(`${plan.id} door ${i}: "${a}" is not a room`);
      if (!plan.rooms[b]) bad.push(`${plan.id} door ${i}: "${b}" is not a room`);
      if (a === b) bad.push(`${plan.id} door ${i}: "${a}" links to itself`);
    });
  }
  empty(bad, 'invalid passages');
});

test('no passage is declared twice', () => {
  const bad = [];
  for (const plan of PLANS) {
    const seen = new Set();
    for (const [a, b] of plan.doors) {
      const key = [a, b].sort().join('↔');
      if (seen.has(key)) bad.push(`${plan.id}: ${key} declared twice`);
      seen.add(key);
    }
  }
  empty(bad, 'duplicate passages');
});

// ---------------------------------------------------------------------------

suite('deck plans — connectivity (§14.3)');

// A room nobody can walk to is a room whose fire nobody can fight.
test('every room is reachable from every other', () => {
  const bad = [];
  for (const plan of PLANS) {
    const keys = Object.keys(plan.rooms);
    for (const from of keys) {
      for (const to of keys) {
        if (route(plan, from, to) === null) {
          bad.push(`${plan.id}: no route from "${from}" to "${to}"`);
        }
      }
    }
  }
  empty(bad, 'unreachable rooms');
});

test('every room has at least one passage', () => {
  const bad = [];
  for (const plan of PLANS) {
    for (const key of Object.keys(plan.rooms)) {
      if (adjacent(plan, key).length === 0) bad.push(`${plan.id}.${key} is sealed`);
    }
  }
  empty(bad, 'sealed rooms');
});

// ---------------------------------------------------------------------------

suite('deck plans — geometry (§14.4)');

// The check the brief singles out: it immediately found a galleon room drawn
// over another, which reading the coordinates had not revealed.
test('no room overlaps another', () => {
  const bad = [];
  for (const plan of PLANS) {
    const entries = Object.entries(plan.rooms);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [ka, a] = entries[i];
        const [kb, b] = entries[j];
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
        if (overlapX && overlapY) bad.push(`${plan.id}: "${ka}" overlaps "${kb}"`);
      }
    }
  }
  empty(bad, 'overlapping rooms');
});

test('every room stays inside the hull box', () => {
  const bad = [];
  for (const plan of PLANS) {
    for (const [key, r] of Object.entries(plan.rooms)) {
      if (r.x < 0 || r.y < 0) bad.push(`${plan.id}.${key} starts outside the box`);
      if (r.x + r.w > 100) bad.push(`${plan.id}.${key} runs past the bow (x+w=${r.x + r.w})`);
      if (r.y + r.h > 100) bad.push(`${plan.id}.${key} runs below the keel (y+h=${r.y + r.h})`);
      if (r.w <= 0 || r.h <= 0) bad.push(`${plan.id}.${key} has no area`);
    }
  }
  empty(bad, 'rooms outside the hull');
});

// Brief §5.3: the magazine is always the deepest, aftmost room — the longest
// to reach and the worst to set alight. That is a design invariant, not a
// drawing detail, so it is worth a test.
test('the magazine is the deepest and aftmost room', () => {
  const bad = [];
  for (const plan of PLANS) {
    const mag = Object.entries(plan.rooms).find(([, r]) => r.system === 'munitions');
    assert(mag, `${plan.id} has no magazine`);
    const [magKey, magRoom] = mag;
    for (const [key, r] of Object.entries(plan.rooms)) {
      if (key === magKey) continue;
      if (r.y + r.h > magRoom.y + magRoom.h) bad.push(`${plan.id}: "${key}" sits deeper than the magazine`);
      if (r.y >= magRoom.y && r.x < magRoom.x) bad.push(`${plan.id}: "${key}" sits further aft than the magazine`);
    }
  }
  empty(bad, 'magazines that are not the deepest aftmost room');
});

// ---------------------------------------------------------------------------

suite('deck plans — complements (§14.5)');

test('minimum working crew is below full complement', () => {
  const bad = [];
  for (const plan of PLANS) {
    if (!(plan.minCrew < plan.maxCrew)) {
      bad.push(`${plan.id}: minCrew ${plan.minCrew} is not below maxCrew ${plan.maxCrew}`);
    }
    if (plan.minCrew <= 0) bad.push(`${plan.id}: minCrew must be positive`);
  }
  empty(bad, 'impossible complements');
});

test('every hull class 1-6 has a plan, and bigger hulls are not smaller ships', () => {
  const bad = [];
  const sizes = [];
  for (let hc = 1; hc <= 6; hc++) {
    let plan;
    try { plan = planFor(hc); } catch (e) { bad.push(e.message); continue; }
    sizes.push([hc, Object.keys(plan.rooms).length, plan.maxCrew]);
  }
  // Hull class counts DOWN as the ship gets bigger (1 = ship of the line).
  for (let i = 1; i < sizes.length; i++) {
    const [hc, rooms, crew] = sizes[i];
    const [prevHc, prevRooms, prevCrew] = sizes[i - 1];
    if (rooms > prevRooms) bad.push(`hull class ${hc} has more rooms than ${prevHc}`);
    if (crew > prevCrew) bad.push(`hull class ${hc} carries more crew than ${prevHc}`);
  }
  empty(bad, 'inconsistent hull sizing');
});

// ---------------------------------------------------------------------------

suite('deck plans — determinism (§14.6)');

// Combat resolution does not exist yet — that lands at step 4, and its own
// determinism test comes with it. What can be pinned now is everything the
// resolver will be built on: identical queries must give identical answers,
// and reading the plan must never quietly mutate it.
test('the same route query always returns the same route', () => {
  for (const plan of PLANS) {
    const keys = Object.keys(plan.rooms);
    for (const from of keys) {
      for (const to of keys) {
        const a = route(plan, from, to);
        const b = route(plan, from, to);
        equal(JSON.stringify(a), JSON.stringify(b), `${plan.id}: ${from}→${to} is not stable`);
      }
    }
  }
});

test('a route is a real walk through connected rooms', () => {
  const bad = [];
  for (const plan of PLANS) {
    const keys = Object.keys(plan.rooms);
    for (const from of keys) {
      for (const to of keys) {
        const path = route(plan, from, to);
        if (!path) continue;
        if (path[0] !== from || path[path.length - 1] !== to) {
          bad.push(`${plan.id}: ${from}→${to} returned ${path.join('→')}`);
          continue;
        }
        for (let i = 1; i < path.length; i++) {
          if (!adjacent(plan, path[i - 1]).includes(path[i])) {
            bad.push(`${plan.id}: ${from}→${to} steps through a wall (${path[i - 1]}→${path[i]})`);
          }
        }
        if (new Set(path).size !== path.length) {
          bad.push(`${plan.id}: ${from}→${to} doubles back (${path.join('→')})`);
        }
      }
    }
  }
  empty(bad, 'routes that are not walkable');
});

test('reading a plan never mutates it', () => {
  for (const plan of PLANS) {
    const before = JSON.stringify(plan);
    const keys = Object.keys(plan.rooms);
    fullStructure(plan);
    disabledSystems(plan, {});
    for (const k of keys) { adjacent(plan, k); route(plan, keys[0], k); }
    equal(JSON.stringify(plan), before, `${plan.id} was mutated by reading it`);
  }
});

// ---------------------------------------------------------------------------

suite('deck plans — behaviour');

test('a fresh ship is at full structure', () => {
  for (const plan of PLANS) {
    const s = fullStructure(plan);
    equal(Object.keys(s).length, Object.keys(plan.rooms).length, `${plan.id}: wrong room count`);
    for (const [key, room] of Object.entries(plan.rooms)) {
      equal(s[key], room.hp, `${plan.id}.${key} not at full structure`);
    }
    equal(disabledSystems(plan, s).length, 0, `${plan.id}: fresh ship has a dead system`);
  }
});

test('a wrecked room takes its system down with it', () => {
  const plan = planFor(3);
  const s = fullStructure(plan);
  s.mat = 0;
  const out = disabledSystems(plan, s);
  equal(out.includes('voiles'), true, 'a wrecked mast should silence the sails');
  equal(out.length, 1, 'only the wrecked room’s system should go down');
});

test('route length is the walking cost between two rooms', () => {
  const grand = planFor(1);
  // Opposite corners of a galleon: sickbay forward on the middle deck, magazine
  // deep aft. This is the walk the brief prices at three turns (§5.3).
  const walk = route(grand, 'infirmerie', 'poudriere');
  assert(walk, 'sickbay and magazine must be connected');
  assert(walk.length - 1 >= 3, `expected at least 3 steps, got ${walk.length - 1} (${walk.join('→')})`);

  const petit = planFor(6);
  const short = route(petit, 'barre', 'soute');
  assert(short.length - 1 <= 3, `a sloop should be small: ${short.join('→')}`);
});

// ---------------------------------------------------------------------------

suite('deck plans — ladders cost more than decks');

test('a passage between decks is a ladder, one along a deck is not', () => {
  const grand = planFor(1);
  equal(isLadder(grand, 'batterieHaute', 'batterieBasse'), true, 'between decks should be a ladder');
  equal(isLadder(grand, 'batterieHaute', 'infirmerie'), false, 'same deck should not be a ladder');
  equal(stepCost(grand, 'batterieHaute', 'batterieBasse') > stepCost(grand, 'batterieHaute', 'infirmerie'),
    true, 'a ladder must cost more than a walk');
});

test('a route costs the sum of its steps', () => {
  const bad = [];
  for (const plan of PLANS) {
    const keys = Object.keys(plan.rooms);
    for (const from of keys) {
      for (const to of keys) {
        const path = route(plan, from, to);
        let sum = 0;
        for (let i = 1; i < path.length; i++) sum += stepCost(plan, path[i - 1], path[i]);
        if (routeCost(plan, path) !== sum) {
          bad.push(`${plan.id}: ${from}→${to} cost ${routeCost(plan, path)} but steps sum to ${sum}`);
        }
      }
    }
  }
  empty(bad, 'routes whose cost disagrees with their steps');
});

// The routing is cheapest-path, not fewest-rooms: with ladders priced higher,
// walking the length of a deck can beat climbing. Brute-forced against every
// simple path, which these graphs are small enough to enumerate.
test('no cheaper route exists than the one returned', () => {
  const allPaths = (plan, from, to, seen = [from]) => {
    if (from === to) return [seen];
    const out = [];
    for (const next of adjacent(plan, from)) {
      if (seen.includes(next)) continue;
      out.push(...allPaths(plan, next, to, seen.concat(next)));
    }
    return out;
  };
  const bad = [];
  for (const plan of PLANS) {
    const keys = Object.keys(plan.rooms);
    for (const from of keys) {
      for (const to of keys) {
        const chosen = routeCost(plan, route(plan, from, to));
        const best = Math.min(...allPaths(plan, from, to).map((p) => routeCost(plan, p)));
        if (chosen > best) bad.push(`${plan.id}: ${from}→${to} costs ${chosen}, but ${best} was possible`);
      }
    }
  }
  empty(bad, 'routes that are not the cheapest available');
});

test('unknown rooms are rejected rather than silently ignored', () => {
  const plan = planFor(3);
  let threw = false;
  try { route(plan, 'coque', 'cale'); } catch { threw = true; }
  equal(threw, true, 'routing from a system name must throw, not return null');
});
