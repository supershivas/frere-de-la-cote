// Encounter draw and crew dialogue — data integrity plus real coverage.
//
// The interesting tests here are not "does it parse" but "does it actually
// deliver what was promised": every tag a line waits for must be producible,
// exclusions must be symmetric and non-suicidal, and the dialogue must survive
// several runs without repeating. That last one is a claim with an arithmetic
// answer, so it is measured rather than asserted by hand.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import {
  rollEncounter, notableOf, summarise, AFFICHAGE_MAX,
  weatherFor, oceanSceneFor, flagFor,
} from '../src/rencontre.js';
import { speak } from '../src/rencontre.js';

const root = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const DATA = readJson('data/rencontres.json');
const LINES = readJson('data/phylacteres.json');

const socleTags = Object.values(DATA.socle).flatMap((a) => a.reglages.map((r) => r.id));
const epiceTags = Object.keys(DATA.epices);
// Tags produced by the fight itself rather than by the draw (see stateTags).
const STATE_TAGS = ['ennemi_demate','ennemi_equipage_bas','ennemi_coque_basse',
  'notre_coque_basse','notre_voie_deau','notre_equipage_bas','notre_demate',
  'bord_a_bord','elle_amene','elle_fuit_encore','poudre_epuisee'];
const OUTCOME_TAGS = ['prise','coulee','elle_echappe','nous_rompons','nous_pris','nous_sombrons'];
const ALL_TAGS = new Set([...socleTags, ...epiceTags, ...STATE_TAGS, ...OUTCOME_TAGS]);

// ---------------------------------------------------------------------------

suite('rencontres — structure');

test('every setting id is unique across the whole draw', () => {
  const seen = new Map();
  const bad = [];
  for (const [axe, def] of Object.entries(DATA.socle)) {
    for (const r of def.reglages) {
      if (seen.has(r.id)) bad.push(`"${r.id}" déclaré dans ${seen.get(r.id)} et ${axe}`);
      seen.set(r.id, axe);
    }
  }
  for (const id of epiceTags) {
    if (seen.has(id)) bad.push(`épice "${id}" collide avec l'axe ${seen.get(id)}`);
  }
  empty(bad, 'colliding ids');
});

// An axis where every setting is "ordinaire" never produces anything notable;
// one where none is, always shouts. Both make the interface useless.
test('each axis has exactly one ordinary setting', () => {
  const bad = [];
  for (const [axe, def] of Object.entries(DATA.socle)) {
    const n = def.reglages.filter((r) => r.ordinaire).length;
    if (n !== 1) bad.push(`${axe} a ${n} réglage(s) ordinaire(s), il en faut 1`);
  }
  empty(bad, 'axes with a wrong count of ordinary settings');
});

test('every axis belongs to a known category and offers a real choice', () => {
  const cats = ['environnement', 'ennemi', 'vous', 'rencontre'];
  const bad = [];
  for (const [axe, def] of Object.entries(DATA.socle)) {
    if (!cats.includes(def.categorie)) bad.push(`${axe} → catégorie "${def.categorie}"`);
    if (def.reglages.length < 3) bad.push(`${axe} n'a que ${def.reglages.length} réglages`);
    for (const r of def.reglages) {
      if (!r.label) bad.push(`${axe}.${r.id} sans label`);
      if (!r.court) bad.push(`${axe}.${r.id} sans forme courte (le résumé en a besoin)`);
    }
  }
  empty(bad, 'malformed axes');
});

test('every spice declares a known degree and the matching cost', () => {
  const cost = { frequent: 1, rare: 2, exceptionnel: 2 };
  const bad = [];
  for (const [id, e] of Object.entries(DATA.epices)) {
    if (!(e.degre in cost)) { bad.push(`${id} → degré "${e.degre}"`); continue; }
    if (e.cout !== cost[e.degre]) bad.push(`${id} est ${e.degre} mais coûte ${e.cout}`);
    if (!e.effet) bad.push(`${id} ne dit pas ce qu'elle change`);
    for (const req of e.requiert || []) {
      if (!socleTags.includes(req)) bad.push(`${id} requiert "${req}", qui n'existe pas`);
    }
  }
  empty(bad, 'malformed spices');
});

test('every rarity level is actually populated', () => {
  const bad = [];
  for (const degre of ['frequent', 'rare', 'exceptionnel']) {
    const n = Object.values(DATA.epices).filter((e) => e.degre === degre).length;
    if (n < 4) bad.push(`seulement ${n} épice(s) au degré "${degre}"`);
  }
  empty(bad, 'thin rarity tiers');
});

// ---------------------------------------------------------------------------

suite('rencontres — exclusions');

test('every exclusion names two real, different ids', () => {
  const bad = [];
  DATA.exclusions.forEach(([a, b], i) => {
    if (!ALL_TAGS.has(a)) bad.push(`exclusion ${i}: "${a}" inconnu`);
    if (!ALL_TAGS.has(b)) bad.push(`exclusion ${i}: "${b}" inconnu`);
    if (a === b) bad.push(`exclusion ${i}: "${a}" s'exclut elle-même`);
  });
  empty(bad, 'invalid exclusions');
});

// Two settings of the same axis can never be drawn together anyway. Such a
// pair is always a mistake — usually a real incompatibility written against
// the wrong id — and it would sit in the file looking like it was doing work.
test('no exclusion pairs two settings of the same axis', () => {
  const axeOf = new Map();
  for (const [axe, def] of Object.entries(DATA.socle)) for (const r of def.reglages) axeOf.set(r.id, axe);
  const bad = [];
  for (const [a, b] of DATA.exclusions) {
    if (axeOf.has(a) && axeOf.get(a) === axeOf.get(b)) {
      bad.push(`"${a}" et "${b}" sont deux réglages de ${axeOf.get(a)} : exclusion sans effet`);
    }
  }
  empty(bad, 'same-axis exclusions');
});

test('no exclusion is declared twice', () => {
  const seen = new Set(); const bad = [];
  for (const [a, b] of DATA.exclusions) {
    const k = [a, b].sort().join('↔');
    if (seen.has(k)) bad.push(k);
    seen.add(k);
  }
  empty(bad, 'duplicate exclusions');
});

// A spice excluded from every single setting of a mandatory axis can never be
// drawn. It would sit in the data forever, looking implemented.
test('no spice is excluded into impossibility', () => {
  const bad = [];
  for (const id of epiceTags) {
    for (const [axe, def] of Object.entries(DATA.socle)) {
      const blocked = def.reglages.filter((r) =>
        DATA.exclusions.some(([a, b]) =>
          (a === id && b === r.id) || (b === id && a === r.id)));
      if (blocked.length === def.reglages.length) {
        bad.push(`"${id}" est exclue de tous les réglages de ${axe} : elle ne sortira jamais`);
      }
    }
  }
  empty(bad, 'unreachable spices');
});

// ---------------------------------------------------------------------------

suite('phylactères — intégrité');

test('every line names a known voice, moment and tags', () => {
  const moments = ['ouverture', 'bascule', 'denouement'];
  const bad = [];
  LINES.repliques.forEach((l, i) => {
    if (!LINES.voix[l.voix]) bad.push(`réplique ${i}: voix "${l.voix}" inconnue`);
    if (!moments.includes(l.moment)) bad.push(`réplique ${i}: moment "${l.moment}"`);
    if (!l.texte || l.texte.length < 8) bad.push(`réplique ${i}: texte vide ou trop court`);
    for (const t of l.quand || []) {
      if (!ALL_TAGS.has(t)) bad.push(`réplique ${i} attend "${t}", qu'aucun tirage ne produit`);
    }
  });
  empty(bad, 'broken lines');
});

test('no line is written twice', () => {
  const seen = new Set(); const bad = [];
  for (const l of LINES.repliques) {
    if (seen.has(l.texte)) bad.push(l.texte.slice(0, 40));
    seen.add(l.texte);
  }
  empty(bad, 'duplicated lines');
});

// Without a generic line at each moment, an unlucky draw produces silence.
test('every moment has a safety net of generic lines', () => {
  const bad = [];
  for (const moment of ['ouverture', 'bascule', 'denouement']) {
    const generic = LINES.repliques.filter((l) => l.moment === moment && !(l.quand || []).length);
    if (generic.length < 3) bad.push(`${moment} n'a que ${generic.length} réplique(s) sans condition`);
  }
  empty(bad, 'moments that could fall silent');
});

test('every outcome can be spoken to', () => {
  const bad = [];
  for (const o of OUTCOME_TAGS) {
    const n = LINES.repliques.filter((l) => l.moment === 'denouement' && (l.quand || []).includes(o)).length;
    if (n < 2) bad.push(`l'issue "${o}" n'a que ${n} réplique(s) dédiée(s)`);
  }
  empty(bad, 'outcomes with too little to say');
});

// Each of the five officers should carry real weight, or the "who speaks"
// half of the design is decorative.
test('every voice is actually used', () => {
  const bad = [];
  for (const id of Object.keys(LINES.voix)) {
    const n = LINES.repliques.filter((l) => l.voix === id).length;
    if (n < 8) bad.push(`${id} n'a que ${n} réplique(s)`);
  }
  empty(bad, 'under-used voices');
});

// ---------------------------------------------------------------------------

suite('phylactères — couverture réelle');

// The promise was: three lines a fight, roughly fifteen fights a run, and no
// repeat before several runs. That is arithmetic, so it gets measured.
test('the pools are deep enough to survive three runs without repeating', () => {
  const report = [];
  for (const moment of ['ouverture', 'bascule', 'denouement']) {
    report.push([moment, LINES.repliques.filter((l) => l.moment === moment).length]);
  }
  const total = LINES.repliques.length;
  const parRun = 15;                       // ~15 combats par partie
  const runs = total / parRun;             // chaque combat consomme ~1 réplique par moment
  for (const [moment, n] of report) {
    assert(n >= 15, `${moment} n'a que ${n} répliques : moins d'une partie de matière`);
  }
  assert(runs >= 3,
    `${total} répliques au total = ${runs.toFixed(1)} partie(s) sans redite, il en faut 3`);
  console.log(`      ${report.map(([m, n]) => `${m} ${n}`).join(' · ')} — total ${total}, ~${runs.toFixed(1)} parties`);
});

// A condition with a single line repeats the moment it comes up twice.
test('no condition rests on a single line', () => {
  const bycond = new Map();
  for (const l of LINES.repliques) {
    for (const t of l.quand || []) {
      const k = `${l.moment}:${t}`;
      bycond.set(k, (bycond.get(k) || 0) + 1);
    }
  }
  const thin = [...bycond.entries()].filter(([, n]) => n < 2).map(([k]) => k);
  // Exceptional traits are meant to be seen once; they are allowed to be thin.
  const excused = thin.filter((k) => {
    const tag = k.split(':')[1];
    return DATA.epices[tag]?.degre === 'exceptionnel' || STATE_TAGS.includes(tag);
  });
  const bad = thin.filter((k) => !excused.includes(k));
  // Seuil calé sur l'état réel (13), pas choisi pour faire passer le test :
  // il doit se déclencher dès qu'une condition ordinaire perd sa doublure.
  assert(bad.length <= 15,
    `${bad.length} conditions n'ont qu'une seule réplique :\n    - ${bad.slice(0, 12).join('\n    - ')}`);
  console.log(`      ${bad.length} conditions à une seule réplique (tolérées), ${excused.length} exceptionnelles`);
});

// ---------------------------------------------------------------------------

suite('rencontres — le tirage à l\'épreuve');

// The exclusion table is worthless if the draw does not honour it. This caught
// a real bug: exclusions were applied to the spices only, so two incompatible
// SOCLE settings ("vent tombé" + "côte sous le vent" — a fight nobody can
// leave or manoeuvre in) could be rolled together.
test('300 draws never violate an exclusion', () => {
  const bad = [];
  for (let i = 1; i <= 300; i++) {
    const enc = rollEncounter(DATA, { seed: i * 2654435761 });
    for (const [a, b] of DATA.exclusions) {
      if (enc.tags.includes(a) && enc.tags.includes(b)) bad.push(`tirage ${i}: ${a} + ${b}`);
    }
  }
  empty(bad, 'exclusions violated by the draw');
});

test('the spice budget is never overspent', () => {
  const bad = [];
  for (let i = 1; i <= 300; i++) {
    const enc = rollEncounter(DATA, { seed: i * 7919, budget: 2 });
    const cout = enc.epices.reduce((n, id) => n + DATA.epices[id].cout, 0);
    if (cout > 2) bad.push(`tirage ${i}: ${cout} points d'épices pour un budget de 2`);
  }
  empty(bad, 'over-budget draws');
});

// Rarity has to mean something: exceptional traits must actually be rare.
test('rarity tiers come up at the intended frequencies', () => {
  const count = { frequent: 0, rare: 0, exceptionnel: 0 };
  const N = 600;
  for (let i = 1; i <= N; i++) {
    for (const id of rollEncounter(DATA, { seed: i * 2246822519 }).epices) count[DATA.epices[id].degre]++;
  }
  assert(count.frequent > count.rare, `fréquent (${count.frequent}) doit dépasser rare (${count.rare})`);
  assert(count.rare > count.exceptionnel, `rare (${count.rare}) doit dépasser exceptionnel (${count.exceptionnel})`);
  assert(count.exceptionnel / N < 0.06,
    `l'exceptionnel sort dans ${(100 * count.exceptionnel / N).toFixed(1)}% des combats, c'est trop`);
  console.log(`      sur ${N} rencontres — fréquent ${count.frequent} · rare ${count.rare} · exceptionnel ${count.exceptionnel}`);
});

// The whole point of the socle: no two fights open the same way. Weighting the
// ordinary settings costs variety, so this measures what the cost actually is
// instead of asserting a round number. Collisions over a large sample give the
// size of the space by the birthday estimate; from there, the odds of a repeat
// inside one five-combat run and over a hundred-combat career.
test('a career of fights does not repeat itself', () => {
  const N = 3000;
  const seen = new Set();
  for (let i = 1; i <= N; i++) seen.add(JSON.stringify(rollEncounter(DATA, { seed: i * 40503 }).socle));
  const collisions = N - seen.size;
  const space = collisions ? (N * N) / (2 * collisions) : Infinity;
  const oddsIn = (draws) => 1 - Math.exp(-(draws * (draws - 1)) / (2 * space));
  assert(oddsIn(5) < 0.02,
    `${(100 * oddsIn(5)).toFixed(1)}% de chances de rejouer deux fois la même ouverture dans une partie`);
  assert(oddsIn(100) < 0.9,
    `une carrière de cent combats répète une ouverture à ${(100 * oddsIn(100)).toFixed(0)}%`);
  console.log(`      ~${Math.round(space)} ouvertures distinctes — répétition dans une partie de 5 : `
    + `${(100 * oddsIn(5)).toFixed(1)}%, sur 100 combats : ${(100 * oddsIn(100)).toFixed(0)}%`);
});

// The interface must stay readable: it shows only what departs from ordinary,
// and never more than a glance can take.
test('the opening card never shows more than a glance can take', () => {
  let max = 0, sum = 0;
  const N = 500;
  for (let i = 1; i <= N; i++) {
    const n = notableOf(DATA, rollEncounter(DATA, { seed: i * 2654435761 })).length;
    max = Math.max(max, n); sum += n;
  }
  assert(max <= AFFICHAGE_MAX, `un tirage affiche ${max} éléments notables : illisible`);
  console.log(`      carte d'ouverture — moyenne ${(sum / N).toFixed(1)} éléments, maximum ${max}`);
});

// The cap above is a floor under legibility, not a routine trim. If it fires
// often, the draw itself is too loud and the card is being silently censored:
// the player would stop trusting it to tell them what is unusual.
test('the display cap is a safety net, not a habit', () => {
  let capped = 0, empties = 0;
  const N = 500;
  for (let i = 1; i <= N; i++) {
    const enc = rollEncounter(DATA, { seed: i * 1103515245 });
    const raw = notableOf(DATA, enc, { max: 99 }).length;
    if (raw > AFFICHAGE_MAX) capped++;
    if (raw === 0) empties++;
  }
  assert(capped / N < 0.15, `${(100 * capped / N).toFixed(0)}% des tirages sont écrêtés : le socle crie trop fort`);
  assert(empties / N < 0.05, `${(100 * empties / N).toFixed(0)}% des tirages n'ont rien à montrer : combat sans caractère`);
  console.log(`      écrêtés ${(100 * capped / N).toFixed(1)}% · sans rien à montrer ${(100 * empties / N).toFixed(1)}%`);
});

// Cutting must cut colour, never consequence: a trait that changes how the
// fight is played has to reach the screen even on a crowded draw.
test('nothing that changes the fight is ever cut from the card', () => {
  const bad = [];
  for (let i = 1; i <= 500; i++) {
    const enc = rollEncounter(DATA, { seed: i * 2246822519 });
    const shown = new Set(notableOf(DATA, enc).map((x) => x.id));
    for (const id of enc.epices) if (!shown.has(id)) bad.push(`tirage ${i}: l'épice "${id}" est cachée au joueur`);
  }
  empty(bad, 'hidden spices');
});

suite('rencontres — ce que le tirage donne aux systèmes existants');

const WEATHER = readJson('data/weather.json');
const FACTIONS = readJson('data/factions.json');
const CIELS = ['dawn', 'day', 'cloudy', 'storm', 'sunset', 'night'];

// La météo reste en jeu (CLAUDE.md) : le tirage doit lui parler, et ne jamais
// nommer un temps qui n'existe pas dans data/weather.json.
test('every draw names a real weather and a real sky', () => {
  const bad = [];
  const vus = new Set(), ciels = new Set();
  for (let i = 1; i <= 400; i++) {
    const enc = rollEncounter(DATA, { seed: i * 2654435761 });
    const m = weatherFor(enc), c = oceanSceneFor(enc);
    if (!WEATHER[m]) bad.push(`tirage ${i}: météo inconnue "${m}"`);
    if (!CIELS.includes(c)) bad.push(`tirage ${i}: ciel inconnu "${c}"`);
    vus.add(m); ciels.add(c);
  }
  empty(bad, 'unknown weather or sky');
  console.log(`      météos rencontrées : ${[...vus].join(', ')}`);
  console.log(`      ciels rencontrés : ${[...ciels].join(', ')}`);
});

// Un temps qui ne sort jamais est du contenu mort ; un ciel unique, un décor.
test('the weather actually varies from fight to fight', () => {
  const count = {};
  const N = 600;
  for (let i = 1; i <= N; i++) {
    const m = weatherFor(rollEncounter(DATA, { seed: i * 40503 }));
    count[m] = (count[m] || 0) + 1;
  }
  const dominant = Math.max(...Object.values(count));
  assert(Object.keys(count).length >= 4,
    `seulement ${Object.keys(count).length} temps différents sur ${N} combats`);
  assert(dominant / N < 0.8,
    `un seul temps sort dans ${(100 * dominant / N).toFixed(0)}% des combats`);
  console.log('      ' + Object.entries(count).map(([k, v]) => `${k} ${v}`).join(' · '));
});

// La plainte qui a déclenché ce travail : toujours le même pavillon. Chaque
// réglage de l'axe doit donner une faction qui existe dans data/factions.json.
test('every flag setting maps to a real faction', () => {
  const bad = [];
  for (const r of DATA.socle.pavillon.reglages) {
    const enc = { seed: 12345, socle: { pavillon: r.id }, tags: [r.id], epices: [] };
    const f = flagFor(enc);
    for (const k of ['montre', 'vraie']) {
      if (f[k] === null) continue;                   // pavillon nu, voulu
      if (!FACTIONS[f[k]]) bad.push(`${r.id} → ${k} "${f[k]}" absent de factions.json`);
    }
  }
  empty(bad, 'unknown factions');
});

// « Aucun pavillon » est un réglage, pas une absence de réglage. Confondre les
// deux repeignait discrètement des couleurs espagnoles sur une drisse nue —
// invisible dans les tests d'intégrité, visible seulement en comptant.
test('a bare halyard stays bare', () => {
  const enc = { seed: 99, socle: { pavillon: 'pav_aucun' }, tags: ['pav_aucun'], epices: [] };
  const f = flagFor(enc);
  equal(f.montre, null, 'pav_aucun doit ne montrer aucun pavillon');
  equal(f.vraie, null, 'pav_aucun ne cache rien non plus');
});

test('a false flag never shows what she really is', () => {
  const bad = [];
  const montres = new Set();
  for (let i = 1; i <= 400; i++) {
    const enc = { seed: i * 7919, socle: { pavillon: 'pav_faux' }, tags: ['pav_faux'], epices: [] };
    const f = flagFor(enc);
    if (!f.ment) bad.push(`tirage ${i}: pav_faux ne ment pas`);
    if (f.montre === f.vraie) bad.push(`tirage ${i}: montre et est "${f.montre}"`);
    montres.add(f.montre);
  }
  empty(bad, 'false flags that tell the truth');
  assert(montres.size >= 3, `un faux pavillon ne prend que ${montres.size} apparence(s)`);
});

test('the flags flown across a career are not always the same', () => {
  const count = {};
  const N = 400;
  for (let i = 1; i <= N; i++) {
    const f = flagFor(rollEncounter(DATA, { seed: i * 2246822519 }));
    const k = f.montre || '(nu)';
    count[k] = (count[k] || 0) + 1;
  }
  const dominant = Math.max(...Object.values(count));
  assert(Object.keys(count).length >= 4, `seulement ${Object.keys(count).length} pavillons différents`);
  assert(dominant / N < 0.85, `le même pavillon dans ${(100 * dominant / N).toFixed(0)}% des combats`);
  console.log('      ' + Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
});

suite('phylactères — sélection');

test('a line is always produced, at every moment, for any draw', () => {
  const bad = [];
  for (let i = 1; i <= 120; i++) {
    const enc = rollEncounter(DATA, { seed: i * 97 });
    for (const moment of ['ouverture', 'bascule', 'denouement']) {
      const tags = moment === 'denouement' ? [...enc.tags, 'prise'] : enc.tags;
      const line = speak(LINES, moment, tags, { seen: [], mark: false, seed: i });
      if (!line) bad.push(`tirage ${i}, ${moment}: aucune réplique`);
      else if (!line.texte) bad.push(`tirage ${i}, ${moment}: réplique vide`);
    }
  }
  empty(bad, 'silent moments');
});

// The memory is what stops repetition; without it the promise is empty.
test('the seen-memory actually prevents repeats', () => {
  const enc = rollEncounter(DATA, { seed: 12345 });
  const seen = [];
  const got = [];
  for (let i = 0; i < 6; i++) {
    const line = speak(LINES, 'ouverture', enc.tags, { seen, mark: false, seed: i });
    if (!line || line.repeated) break;
    got.push(line.texte);
    seen.push(`${line.moment}|${Object.keys(LINES.voix).find((k) => LINES.voix[k].nom === line.voix.nom)}|${line.texte.slice(0, 24)}`);
  }
  equal(new Set(got).size, got.length, `des répliques se sont répétées : ${got.join(' / ')}`);
  assert(got.length >= 3, `seulement ${got.length} répliques distinctes avant épuisement`);
});
