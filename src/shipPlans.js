// Deck plans — the spatial skeleton of a ship, brief §5.3 / §5.4.
//
// A ship is no longer one hit-point bar: it is a set of rooms, each with its
// own structure and its own system, connected by explicit passages. Damage is
// localized, crew walk the passages, and the geography is the mechanic — on a
// sloop everything is three paces away, on a galleon sending the surgeon from
// the sickbay to a burning magazine costs three turns of walking.
//
// Layout conventions, identical at every size:
//   - horizontal axis: stern on the LEFT, bow on the RIGHT
//   - vertical axis: upper deck at the TOP, hold at the BOTTOM
//   - the magazine is ALWAYS deepest and aftmost: the longest to reach, the
//     most catastrophic to set alight
//   - batteries are long horizontal rooms spanning their deck
//   - rooms do NOT all communicate; deck changes happen by ladder
//   - rooms are deliberately different sizes
//
// Coordinates are percentages of the hull box, so a plan overlays whatever
// sprite the generator draws for that hull class.
//
// NOTE ON KEYS (brief §13, §14.1): a room key is never a system name. That
// confusion — reading rooms["coque"], a *system*, where a room key was
// expected — is what crashed the previous prototype every end of turn.
// `test/shipPlans.test.js` fails if the two vocabularies ever collide again.

// ---------------------------------------------------------------------------
// Crew specialties (brief §6.2). Five, and each room calls on exactly one of
// them: a man in the wrong room still works, just badly, so placement matters
// without needing a rule that forbids anything.

export const SPECIALTIES = ['canonnage', 'manoeuvre', 'reparation', 'soins', 'melee'];

// Moving between decks means a ladder, and a ladder is slower than walking the
// length of a deck. Costs are in the same unit as a step, and routing is
// cheapest-path, so a man will walk around rather than climb when that is
// quicker — the ship's internal logistics, which is the point of §5.3.
export const STEP_COST = 1;
export const LADDER_COST = 2;

// ---------------------------------------------------------------------------
// Systems (brief §5.4). Deliberately named apart from every room key.
// `atZero` is the consequence stated in plain language — the interface shows
// this, not a stat delta (brief §4.6).

export const SYSTEMS = {
  gouvernail:   { specialty: 'manoeuvre',  atZero: 'room_out_gouvernail' },
  voiles:       { specialty: 'manoeuvre',  atZero: 'room_out_voiles' },
  coque:        { specialty: 'reparation', atZero: 'room_out_coque' },
  canons:       { specialty: 'canonnage',  atZero: 'room_out_canons' },
  pompes:       { specialty: 'reparation', atZero: 'room_out_pompes' },
  munitions:    { specialty: 'canonnage',  atZero: 'room_out_munitions' },
  chirurgie:    { specialty: 'soins',      atZero: 'room_out_chirurgie' },
  commandement: { specialty: 'melee',      atZero: 'room_out_commandement' },
};

// ---------------------------------------------------------------------------
// The three plans. Hull classes 5-6 are barque/sloop, 3-4 brigantine/frigate,
// 1-2 galleon/ship of the line — the classes the sprite generator already uses.

const PLANS = {
  // 4 rooms. Everything within three paces; hold and magazine are one room.
  petit: {
    id: 'petit',
    hullClasses: [5, 6],
    decks: 2,
    // Minimum hands to work her, and the most she can carry. Anything above the
    // minimum is boarding strength; below it, she is degraded (brief §6.4).
    minCrew: 12,
    maxCrew: 45,
    rooms: {
      barre:    { name: 'room_barre',    x: 5,  y: 26, w: 18, h: 26, hp: 2, system: 'gouvernail', open: true },
      mat:      { name: 'room_mat',      x: 25, y: 22, w: 28, h: 30, hp: 3, system: 'voiles', open: true },
      batterie: { name: 'room_batterie', x: 20, y: 56, w: 58, h: 20, hp: 3, system: 'canons' },
      soute:    { name: 'room_soute',    x: 10, y: 78, w: 26, h: 16, hp: 2, system: 'munitions' },
    },
    doors: [
      ['barre', 'mat'],
      ['mat', 'batterie'],
      ['batterie', 'soute'],
    ],
  },

  // 6 rooms over two decks. The bow becomes its own room, so a hull breach is
  // a place you can lose rather than a number that drops.
  moyen: {
    id: 'moyen',
    hullClasses: [3, 4],
    decks: 2,
    minCrew: 30,
    maxCrew: 80,
    rooms: {
      barre:     { name: 'room_barre',     x: 6,  y: 30, w: 17, h: 22, hp: 2, system: 'gouvernail', open: true },
      mat:       { name: 'room_mat',       x: 25, y: 26, w: 26, h: 26, hp: 3, system: 'voiles', open: true },
      proue:     { name: 'room_proue',     x: 53, y: 30, w: 24, h: 22, hp: 3, system: 'coque', open: true },
      batterie:  { name: 'room_batterie',  x: 20, y: 54, w: 57, h: 20, hp: 3, system: 'canons' },
      poudriere: { name: 'room_poudriere', x: 12, y: 76, w: 19, h: 17, hp: 2, system: 'munitions' },
      cale:      { name: 'room_cale',      x: 33, y: 76, w: 30, h: 17, hp: 3, system: 'pompes' },
    },
    doors: [
      ['barre', 'mat'],
      ['mat', 'proue'],
      ['mat', 'batterie'],
      ['batterie', 'proue'],
      ['batterie', 'cale'],
      ['cale', 'poudriere'],
    ],
  },

  // 9 rooms over three decks. Powerful, and slow to administer: the sickbay is
  // at the bow on the upper deck, the magazine deep aft — opposite corners.
  grand: {
    id: 'grand',
    hullClasses: [1, 2],
    decks: 3,
    minCrew: 45,
    maxCrew: 150,
    rooms: {
      barre:         { name: 'room_barre',         x: 5,  y: 24, w: 15, h: 19, hp: 2, system: 'gouvernail', open: true },
      mat:           { name: 'room_mat',           x: 22, y: 20, w: 24, h: 23, hp: 3, system: 'voiles', open: true },
      proue:         { name: 'room_proue',         x: 48, y: 24, w: 22, h: 19, hp: 3, system: 'coque', open: true },
      gaillard:      { name: 'room_gaillard',      x: 5,  y: 45, w: 15, h: 18, hp: 2, system: 'commandement' },
      batterieHaute: { name: 'room_batterie_haute', x: 22, y: 45, w: 48, h: 17, hp: 3, system: 'canons' },
      infirmerie:    { name: 'room_infirmerie',    x: 72, y: 45, w: 16, h: 17, hp: 2, system: 'chirurgie' },
      batterieBasse: { name: 'room_batterie_basse', x: 22, y: 64, w: 48, h: 17, hp: 4, system: 'canons' },
      poudriere:     { name: 'room_poudriere',     x: 10, y: 83, w: 18, h: 14, hp: 2, system: 'munitions' },
      cale:          { name: 'room_cale',          x: 30, y: 83, w: 32, h: 14, hp: 3, system: 'pompes' },
    },
    doors: [
      ['barre', 'mat'],
      ['barre', 'gaillard'],
      ['mat', 'proue'],
      ['mat', 'batterieHaute'],
      ['gaillard', 'batterieHaute'],
      ['batterieHaute', 'infirmerie'],
      ['batterieHaute', 'batterieBasse'],
      ['batterieBasse', 'cale'],
      ['cale', 'poudriere'],
    ],
  },
};

// ---------------------------------------------------------------------------
// Lookup

const BY_HULL_CLASS = {};
for (const plan of Object.values(PLANS)) {
  for (const hc of plan.hullClasses) BY_HULL_CLASS[hc] = plan;
}

export function planFor(hullClass) {
  const plan = BY_HULL_CLASS[hullClass];
  if (!plan) throw new Error(`no deck plan for hull class ${JSON.stringify(hullClass)}`);
  return plan;
}

export function allPlans() {
  return Object.values(PLANS);
}

// ---------------------------------------------------------------------------
// Room graph. Passages are undirected; crew walk them one room at a time, so
// distance on this graph is distance in turns (brief §6.3).

export function adjacent(plan, key) {
  const out = [];
  for (const [a, b] of plan.doors) {
    if (a === key) out.push(b);
    else if (b === key) out.push(a);
  }
  return out;
}

// Two rooms are on different decks when their vertical bands do not overlap:
// getting between them means a ladder, not a walk along the deck.
export function isLadder(plan, a, b) {
  const A = plan.rooms[a];
  const B = plan.rooms[b];
  if (!A || !B) throw new Error(`unknown room in passage "${a}"↔"${b}"`);
  return !(A.y < B.y + B.h && B.y < A.y + A.h);
}

export function stepCost(plan, a, b) {
  return isLadder(plan, a, b) ? LADDER_COST : STEP_COST;
}

// Cheapest route between two rooms, or null when none exists.
//
// Not breadth-first: ladders cost more than walking a deck, so the cheapest
// route is not always the one through fewest rooms — a man will walk the length
// of a deck rather than climb twice. Ties are broken by insertion order and the
// frontier is scanned in that order, so the same query always returns the same
// route; the crew must not wander differently between two identical turns
// (brief §4.1, §14.6).
export function route(plan, from, to) {
  if (!plan.rooms[from]) throw new Error(`unknown room "${from}"`);
  if (!plan.rooms[to]) throw new Error(`unknown room "${to}"`);
  if (from === to) return [from];

  const best = { [from]: { cost: 0, path: [from] } };
  const settled = new Set();
  for (;;) {
    let cur = null;
    for (const key of Object.keys(best)) {
      if (settled.has(key)) continue;
      if (cur === null || best[key].cost < best[cur].cost) cur = key;
    }
    if (cur === null) return null;
    if (cur === to) return best[to].path;
    settled.add(cur);
    for (const next of adjacent(plan, cur)) {
      if (settled.has(next)) continue;
      const cost = best[cur].cost + stepCost(plan, cur, next);
      if (!best[next] || cost < best[next].cost) {
        best[next] = { cost, path: best[cur].path.concat(next) };
      }
    }
  }
}

// What a route costs in turns, ladders included.
export function routeCost(plan, path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += stepCost(plan, path[i - 1], path[i]);
  return total;
}

// Rooms whose system is out of action, given a map of room key → structure.
export function disabledSystems(plan, structure) {
  const out = [];
  for (const key of Object.keys(plan.rooms)) {
    const hp = structure[key];
    if (typeof hp === 'number' && hp <= 0) out.push(plan.rooms[key].system);
  }
  return out;
}

// A fresh structure map at full health — the starting state of an undamaged
// ship, and the reference the tests compare against.
export function fullStructure(plan) {
  const out = {};
  for (const [key, room] of Object.entries(plan.rooms)) out[key] = room.hp;
  return out;
}
