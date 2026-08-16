// Encounter setup and crew dialogue — everything that makes two fights differ.
//
// The whole draw happens BEFORE the first turn. That is deliberate: the brief
// allows randomness in generation and forbids it in resolution (§4.1), so the
// dice are thrown once, up front, and the fight itself stays a puzzle.
//
// Two layers:
//   - the SOCLE: fourteen axes, drawn in full every time. It is the material
//     the dialogue draws on, and it is mostly NOT shown in the interface.
//   - the ÉPICES: rare traits, drawn against a small budget. They ARE shown,
//     because they change how the fight is played.
//
// The interface shows what departs from the ordinary; the dialogue may speak
// about anything.

const STORE_KEY = 'fdlc_repliques_vues';

// --- deterministic-ish PRNG, seeded per encounter ---------------------------
// Seeded so an encounter can be replayed identically for debugging; the seed
// itself is the only place entropy enters.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// Draw from `arr` with a weight function. Used for the socle, where the
// ordinary setting has to be genuinely likelier than each departure — see
// `ordinaryWeight` below.
function pickWeighted(r, arr, weightOf) {
  let total = 0;
  for (const x of arr) total += weightOf(x);
  let n = r() * total;
  for (const x of arr) { n -= weightOf(x); if (n <= 0) return x; }
  return arr[arr.length - 1];
}

// An axis offers one ordinary setting and several departures. Drawing them
// uniformly means an axis with six settings departs five times out of six —
// fourteen such axes and every fight is a freak show with nothing to notice.
// So the ordinary setting carries the weight of all its rivals put together,
// scaled so that an axis departs with probability `frequence_depart`.
function ordinaryWeight(rivals, p) {
  return rivals * (1 / Math.max(p, 0.01) - 1);
}

// ---------------------------------------------------------------------------
// The draw

/**
 * Roll a full encounter.
 * @param {object} data  contents of data/rencontres.json
 * @param {object} opts  { seed, budget, force: [ids] }
 */
export function rollEncounter(data, { seed = 1, budget = 2, force = [] } = {}) {
  const r = rng(seed);
  const socle = {};
  const tags = [];

  // Exclusions bind the socle too, not just the spices: "vent tombé" and "côte
  // sous le vent" are both ordinary settings, and together they describe a
  // fight nobody can leave or manoeuvre in. Each axis is drawn among the
  // settings still compatible with what has already been rolled.
  const p = data.frequence_depart ?? 0.25;
  for (const [axe, def] of Object.entries(data.socle)) {
    const ouverts = def.reglages.filter((x) => !conflicts(data, tags, x.id));
    const pool = ouverts.length ? ouverts : def.reglages;
    const rivals = Math.max(1, pool.filter((x) => !x.ordinaire).length);
    const choix = pickWeighted(r, pool, (x) => (x.ordinaire ? ordinaryWeight(rivals, p) : 1));
    socle[axe] = choix.id;
    tags.push(choix.id);
  }

  // Épices, drawn against a budget so a fight never becomes an unreadable pile.
  const epices = [];
  let left = budget;
  const pool = Object.entries(data.epices).map(([id, e]) => ({ id, ...e }));
  const forced = pool.filter((e) => force.includes(e.id));
  for (const e of forced) { epices.push(e.id); tags.push(e.id); left -= e.cout; }

  let guard = 0;
  while (left > 0 && guard++ < 40) {
    const affordable = pool.filter((e) =>
      e.cout <= left &&
      !epices.includes(e.id) &&
      (!e.requiert || e.requiert.every((t) => tags.includes(t))) &&
      !conflicts(data, tags, e.id));
    if (!affordable.length) break;
    // Weight by rarity: frequent traits come up far more than exceptional ones.
    const weighted = [];
    for (const e of affordable) {
      const n = e.degre === 'frequent' ? 12 : e.degre === 'rare' ? 4 : 1;
      for (let i = 0; i < n; i++) weighted.push(e);
    }
    const chosen = pick(r, weighted);
    epices.push(chosen.id);
    tags.push(chosen.id);
    left -= chosen.cout;
  }

  return { seed, socle, epices, tags };
}

// Two traits that make an unplayable or illegible fight must never co-occur.
export function conflicts(data, tags, candidate) {
  return data.exclusions.some(([a, b]) =>
    (a === candidate && tags.includes(b)) || (b === candidate && tags.includes(a)));
}

// What the interface shows: only what departs from the ordinary, and only as
// much of it as a player can read at a glance. Everything else stays available
// to the dialogue but off the screen — the socle is the material of the
// dialogue, the exception is the material of the interface.
//
// The cap is a floor under legibility, not a routine trim: with the weighted
// draw above, an encounter yields three or four notable things and the limit
// never bites. It exists for the unlucky tail.
export const AFFICHAGE_MAX = 6;

// Highest first. An épice outranks a setting, a rarer épice outranks a common
// one, and anything that changes how the fight plays outranks pure colour.
function salience(item) {
  if (item.degre) return { exceptionnel: 6, rare: 5, frequent: 4 }[item.degre] ?? 4;
  return item.effet ? 2 : 1;
}

export function notableOf(data, enc, { max = AFFICHAGE_MAX } = {}) {
  const out = [];
  const order = new Map();
  for (const [axe, def] of Object.entries(data.socle)) {
    const choix = def.reglages.find((x) => x.id === enc.socle[axe]);
    // The axis name travels with the setting: "Tombé" means nothing alone,
    // "Vent — Tombé" is a line of a log.
    if (choix && !choix.ordinaire) {
      out.push({ id: choix.id, label: choix.label, effet: choix.effet, axe, axeLabel: def.label });
    }
  }
  for (const id of enc.epices) {
    const e = data.epices[id];
    if (e) out.push({ id, label: e.label, effet: e.effet, degre: e.degre });
  }
  out.forEach((item, i) => order.set(item.id, i));
  if (out.length <= max) return out;
  // Keep the most salient, then put them back in declaration order so the card
  // still reads environment, enemy, us, encounter.
  return out
    .slice()
    .sort((a, b) => salience(b) - salience(a) || order.get(a.id) - order.get(b.id))
    .slice(0, max)
    .sort((a, b) => order.get(a.id) - order.get(b.id));
}

// One line of prose describing the encounter, built from the short forms.
// This is what a captain would write in the log, not a list of parameters.
export function summarise(data, enc) {
  const shortOf = (axe) => {
    const def = data.socle[axe];
    const choix = def && def.reglages.find((x) => x.id === enc.socle[axe]);
    return choix ? choix.court : '';
  };
  const bits = [
    shortOf('cargaison'), shortOf('equipage_ennemi'), shortOf('pavillon'),
    shortOf('heure'), shortOf('mer'), shortOf('posture'),
  ].filter(Boolean);
  return bits.join(', ') + '.';
}

// ---------------------------------------------------------------------------
// Dialogue

/**
 * Choose a line for a moment. Prefers the most specific line whose conditions
 * are all satisfied, skipping anything already seen — across runs, not just
 * within one. When a pool runs dry it falls back to less specific lines rather
 * than repeating: a repeat is worse than a generic line.
 */
export function speak(lines, moment, tags, { seen = loadSeen(), mark = true, seed = 1 } = {}) {
  const fits = (l) => l.moment === moment && (l.quand || []).every((t) => tags.includes(t));
  const candidates = lines.repliques.filter(fits);
  if (!candidates.length) return null;

  const maxSpec = Math.max(...candidates.map((l) => (l.quand || []).length));
  for (let spec = maxSpec; spec >= 0; spec--) {
    const tier = candidates.filter((l) => (l.quand || []).length === spec);
    const unseen = tier.filter((l) => !seen.includes(keyOf(l)));
    const from = unseen.length ? unseen : [];
    if (!from.length) continue;
    const chosen = pick(rng(seed + spec * 7919), from);
    if (mark) rememberSeen(keyOf(chosen), seen);
    return { ...chosen, voix: lines.voix[chosen.voix] || { nom: chosen.voix } };
  }
  // Everything at every tier has been seen: allow a repeat, most generic first.
  const tier0 = candidates.filter((l) => (l.quand || []).length === 0);
  const fallback = pick(rng(seed), tier0.length ? tier0 : candidates);
  return { ...fallback, voix: lines.voix[fallback.voix] || { nom: fallback.voix }, repeated: true };
}

const keyOf = (l) => `${l.moment}|${l.voix}|${l.texte.slice(0, 24)}`;

export function loadSeen() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function rememberSeen(key, seen) {
  if (seen.includes(key)) return;
  seen.push(key);
  // Keep the memory from growing without bound; oldest lines become available
  // again long after the player could remember them.
  const trimmed = seen.slice(-600);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(trimmed)); } catch { /* private mode */ }
}
export function forgetSeen() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}

// Tags describing how the fight is going, fed to `speak` at the bascule and
// the dénouement on top of the encounter's own tags.
export function stateTags(B) {
  const t = [];
  const m = B.mine, e = B.theirs;
  if (e.rig <= 25) t.push('ennemi_demate');
  if (e.crew <= 40) t.push('ennemi_equipage_bas');
  if (e.coque <= 40) t.push('ennemi_coque_basse');
  if (m.coque <= 40) t.push('notre_coque_basse');
  if (m.leak) t.push('notre_voie_deau');
  if (m.crew <= 40) t.push('notre_equipage_bas');
  if (m.rig <= 25) t.push('notre_demate');
  if (B.dist === 0) t.push('bord_a_bord');
  if (e.struck) t.push('elle_amene');
  return t;
}
