// Data-integrity suite.
//
// Brief §13, verbatim: "une validation de syntaxe ne détecte pas une clé
// d'objet erronée. Il faut valider les données, pas seulement le code."
//
// Every check here is a wrong-key detector. They are cheap, they run on plain
// node, and they are the ones that catch the mistakes reading the source does
// not: an id that disagrees with its key, a cross-reference to something that
// no longer exists, an effect flag no system actually reads, a translation key
// present in one locale and missing in the other.
//
// Step 1 of the chantier adds `test/shipPlans.test.js` for the deck-plan
// invariants of brief §14 (room-key coherence, passage validity, graph
// connectivity, geometric overlap, crew minimums, determinism).

import { readFileSync, readdirSync } from 'node:fs';
import { suite, test, assert, empty } from './harness.js';

const root = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const readText = (p) => readFileSync(new URL(p, root), 'utf8');

const DB = {
  ships: readJson('data/ships.json'),
  enemies: readJson('data/enemies.json'),
  bosses: readJson('data/bosses.json'),
  upgrades: readJson('data/upgrades.json'),
  relics: readJson('data/relics.json'),
  events: readJson('data/events.json'),
  ammo: readJson('data/ammo.json'),
  weather: readJson('data/weather.json'),
  factions: readJson('data/factions.json'),
};
const LOC = { fr: readJson('locales/fr.json'), en: readJson('locales/en.json') };

// Every .js file under src/, as text — used to grep for key references.
const srcFiles = [];
for (const f of readdirSync(new URL('src/', root))) {
  if (f.endsWith('.js')) srcFiles.push(['src/' + f, readText('src/' + f)]);
}
for (const f of readdirSync(new URL('src/screens/', root))) {
  if (f.endsWith('.js')) srcFiles.push(['src/screens/' + f, readText('src/screens/' + f)]);
}
const allSrc = srcFiles.map(([, s]) => s).join('\n');

// ---------------------------------------------------------------------------

suite('data — identity');

// The single most common silent bug: an entry copied, its key renamed, its
// inner `id` left behind. Code that looks the entry up by `def.id` then misses.
test('every entry\'s id matches its key', () => {
  const bad = [];
  for (const [file, table] of Object.entries(DB)) {
    for (const [key, entry] of Object.entries(table)) {
      if (entry && typeof entry === 'object' && 'id' in entry && entry.id !== key) {
        bad.push(`${file}.${key} declares id="${entry.id}"`);
      }
    }
  }
  empty(bad, 'entries whose id disagrees with their key');
});

test('every entry is named in both locales', () => {
  const bad = [];
  for (const [file, table] of Object.entries(DB)) {
    if (file === 'events') continue; // events use title_fr / title_en
    for (const [key, entry] of Object.entries(table)) {
      if (!entry.name_fr) bad.push(`${file}.${key} has no name_fr`);
      if (!entry.name_en) bad.push(`${file}.${key} has no name_en`);
    }
  }
  for (const [key, entry] of Object.entries(DB.events)) {
    if (!entry.title_fr) bad.push(`events.${key} has no title_fr`);
    if (!entry.title_en) bad.push(`events.${key} has no title_en`);
  }
  empty(bad, 'entries missing a localized name');
});

// ---------------------------------------------------------------------------

suite('data — cross-references');

test('every faction reference resolves', () => {
  const bad = [];
  for (const file of ['ships', 'enemies', 'bosses']) {
    for (const [key, entry] of Object.entries(DB[file])) {
      if (entry.faction && !DB.factions[entry.faction]) {
        bad.push(`${file}.${key} → faction "${entry.faction}"`);
      }
    }
  }
  empty(bad, 'dangling faction references');
});

test('every weakness names a real ammo type', () => {
  const bad = [];
  for (const file of ['enemies', 'bosses']) {
    for (const [key, entry] of Object.entries(DB[file])) {
      if (entry.weakness && !DB.ammo[entry.weakness]) {
        bad.push(`${file}.${key} → ammo "${entry.weakness}"`);
      }
    }
  }
  empty(bad, 'dangling weakness references');
});

test('every relic reward resolves', () => {
  const bad = [];
  for (const [key, entry] of Object.entries(DB.bosses)) {
    const rid = entry.reward && entry.reward.relic;
    if (rid && !DB.relics[rid]) bad.push(`bosses.${key} → relic "${rid}"`);
  }
  empty(bad, 'dangling relic rewards');
});

// A ship-typed foe with no hull class silently fell back to the legacy blob
// renderer — which is how the act boss spent a session drawn as a monster.
test('every ship-typed foe can be drawn as a ship', () => {
  const bad = [];
  for (const file of ['enemies', 'bosses']) {
    for (const [key, entry] of Object.entries(DB[file])) {
      if (entry.type === 'naval_monster' || entry.type === 'monster') continue;
      const hc = entry.hullClass;
      if (hc === undefined) {
        // Derived from tier instead — that path only knows 'medium' and 'small'.
        if (!entry.tier) bad.push(`${file}.${key} declares neither hullClass nor tier`);
      } else if (!Number.isInteger(hc) || hc < 1 || hc > 6) {
        bad.push(`${file}.${key} has hullClass ${JSON.stringify(hc)} (expected 1-6)`);
      }
    }
  }
  empty(bad, 'foes that cannot be rendered as ships');
});

test('every ability referenced by a ship exists', () => {
  const abilities = [...readText('src/abilities.js').matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1]);
  assert(abilities.length > 0, 'could not parse ABILITIES from src/abilities.js');
  const bad = [];
  for (const file of ['ships', 'enemies', 'bosses']) {
    for (const [key, entry] of Object.entries(DB[file])) {
      if (entry.ability && !abilities.includes(entry.ability)) {
        bad.push(`${file}.${key} → ability "${entry.ability}"`);
      }
    }
  }
  empty(bad, 'dangling ability references');
});

// This is the §13 bug class exactly: a data file declaring a flag that no
// system reads. It stays syntactically perfect and silently does nothing.
test('every relic effect flag is read by relicMods()', () => {
  const mods = readText('src/state.js');
  const block = mods.slice(mods.indexOf('export function relicMods()'));
  const known = new Set([...block.matchAll(/fx\.(\w+)/g)].map((m) => m[1]));
  assert(known.size > 0, 'could not parse relicMods() from src/state.js');
  // applyRelicOnPickup handles one-shot effects outside the aggregate.
  for (const m of mods.matchAll(/fx\.(\w+)/g)) known.add(m[1]);

  const bad = [];
  for (const [key, relic] of Object.entries(DB.relics)) {
    for (const flag of Object.keys(relic.effects || {})) {
      if (!known.has(flag)) bad.push(`relics.${key} declares "${flag}", which no system reads`);
    }
  }
  empty(bad, 'inert relic effect flags');
});

test('every event outcome type is handled by applyOutcome()', () => {
  const src = readText('src/screens/event.js');
  const handled = new Set([...src.matchAll(/case '(\w+)':/g)].map((m) => m[1]));
  assert(handled.size > 0, 'could not parse applyOutcome() cases');
  const bad = [];
  for (const [key, ev] of Object.entries(DB.events)) {
    for (const choice of ev.choices || []) {
      for (const out of choice.outcomes || []) {
        if (out.type && !handled.has(out.type)) {
          bad.push(`events.${key} → outcome type "${out.type}"`);
        }
        if (out.type === 'weather_change' && out.value && !DB.weather[out.value]) {
          bad.push(`events.${key} → weather "${out.value}"`);
        }
      }
    }
  }
  empty(bad, 'unhandled event outcome types');
});

test('every event choice offers at least one outcome', () => {
  const bad = [];
  for (const [key, ev] of Object.entries(DB.events)) {
    if (!ev.choices || !ev.choices.length) { bad.push(`events.${key} has no choices`); continue; }
    ev.choices.forEach((c, i) => {
      if (!c.outcomes || !c.outcomes.length) bad.push(`events.${key} choice ${i} has no outcomes`);
    });
  }
  empty(bad, 'events that cannot resolve');
});

// ---------------------------------------------------------------------------

suite('data — map');

// A node type that can be rolled but has no metadata renders as `undefined`;
// one that has no route silently dead-ends the run.
test('every rollable node type has metadata and a route', () => {
  const src = readText('src/map.js');
  const weights = [...src.matchAll(/\['(\w+)',\s*\d+\]/g)].map((m) => m[1]);
  const metaBlock = src.slice(src.indexOf('const NODE_META'), src.indexOf('function pickWeighted'));
  const meta = [...metaBlock.matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1]);
  const routed = [...src.matchAll(/case '(\w+)':/g)].map((m) => m[1]);
  assert(weights.length && meta.length && routed.length, 'could not parse src/map.js');

  const bad = [];
  for (const type of weights) {
    if (!meta.includes(type)) bad.push(`TYPE_WEIGHTS has "${type}" but NODE_META does not`);
    if (!routed.includes(type)) bad.push(`TYPE_WEIGHTS has "${type}" but routeToNode does not`);
  }
  for (const type of meta) {
    if (!routed.includes(type) && type !== 'start') {
      bad.push(`NODE_META has "${type}" but routeToNode does not`);
    }
  }
  empty(bad, 'node types that would break a run');
});

test('the boss the chart routes to exists', () => {
  const src = readText('src/map.js');
  const m = src.match(/bossId:\s*'(\w+)'/);
  assert(m, 'no bossId found in src/map.js');
  assert(DB.bosses[m[1]], `src/map.js routes to boss "${m[1]}", absent from data/bosses.json`);
});

// ---------------------------------------------------------------------------

suite('locales');

test('fr and en declare the same keys', () => {
  const fr = Object.keys(LOC.fr);
  const en = Object.keys(LOC.en);
  const bad = [
    ...fr.filter((k) => !LOC.en[k]).map((k) => `missing from en: ${k}`),
    ...en.filter((k) => !LOC.fr[k]).map((k) => `missing from fr: ${k}`),
  ];
  empty(bad, 'locale key mismatches');
});

// t('foo') with no matching entry renders the raw key on screen.
test('every t() key referenced in src/ exists in both locales', () => {
  const bad = [];
  for (const [file, src] of srcFiles) {
    for (const m of src.matchAll(/\bt\('([a-z0-9_]+)'\)/g)) {
      const key = m[1];
      if (!(key in LOC.fr)) bad.push(`${file}: t('${key}') missing from fr`);
      if (!(key in LOC.en)) bad.push(`${file}: t('${key}') missing from en`);
    }
  }
  empty(bad, 'untranslated keys referenced in code');
});

test('every ability i18n key exists', () => {
  const src = readText('src/abilities.js');
  const bad = [];
  for (const m of src.matchAll(/(?:nameKey|descKey):\s*'([a-z0-9_]+)'/g)) {
    if (!(m[1] in LOC.fr)) bad.push(`abilities.js: "${m[1]}" missing from fr`);
    if (!(m[1] in LOC.en)) bad.push(`abilities.js: "${m[1]}" missing from en`);
  }
  empty(bad, 'untranslated ability keys');
});

// ---------------------------------------------------------------------------

suite('refonte — abandoned content stays abandoned');

// Brief §2: the Mechanical Kraken belongs to another game. This guards the
// deletion so it cannot creep back in through a copy-paste.
test('no Kraken remains in data, locales or source', () => {
  const bad = [];
  for (const [name, table] of Object.entries(DB)) {
    if (JSON.stringify(table).toLowerCase().includes('kraken')) bad.push(`data/${name}.json`);
  }
  for (const [lang, table] of Object.entries(LOC)) {
    if (JSON.stringify(table).toLowerCase().includes('kraken')) bad.push(`locales/${lang}.json`);
  }
  for (const [file, src] of srcFiles) {
    if (src.toLowerCase().includes('kraken')) bad.push(file);
  }
  empty(bad, 'files still mentioning the Kraken');
});

// Brief §4.1: combat resolution must become fully deterministic. The old engine
// is still random, so this only records where the randomness lives — it will
// tighten to "none" when the new engine lands at step 4.
test('combat randomness is confined to the legacy engine', () => {
  const offenders = srcFiles
    .filter(([f, s]) => s.includes('Math.random') && f !== 'src/combat.js')
    .map(([f]) => f);
  const expected = ['src/map.js', 'src/ocean.js', 'src/fx.js', 'src/sprites.js',
    'src/screens/event.js', 'src/screens/port.js', 'src/screens/treasure.js',
    'src/screens/editor.js', 'src/screens/shipyard.js', 'src/state.js', 'src/debug.js'];
  const unexpected = offenders.filter((f) => !expected.includes(f));
  empty(unexpected, 'new sources of randomness outside generation');
});
