// Le voyage sur la carte des Caraïbes.
//
// Ce que ces tests protègent : la carte est une MER RÉELLE, pas une échelle.
// On en part toujours du même coin, on ne peut pas sauter d'un bout à l'autre,
// et chaque escale dit ce qu'elle est avant qu'on y aille. Le jour où l'un des
// trois cesse d'être vrai, la carte redevient une liste de nœuds.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import * as V from '../src/voyage.js';
import { placeById, places, legDistance } from '../src/caribbean.js';
import * as C2 from '../src/caribbean.js';

const CONTENU = JSON.parse(readFileSync(new URL('../data/equipage.json', import.meta.url), 'utf8'));
const rngFor = (seed) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};

suite('voyage — la carte est une mer');

test('every run starts from the same corner', () => {
  equal(V.nouveauVoyage().lieu, 'tortue', 'le voyage ne part pas de l’Île de la Tortue');
  assert(placeById('tortue').start === true, 'la Tortue n’est plus marquée comme départ');
});

test('you cannot sail somewhere you cannot reach', () => {
  const v = V.nouveauVoyage();
  const loin = places().find((p) => p.act === 3);
  const r = V.cingler(v, loin.id);
  equal(r.ok, false, 'on a pu cingler droit sur la Terre-Ferme depuis la Tortue');
  assert(/loin/i.test(r.pourquoi), `le refus n'explique pas la distance : « ${r.pourquoi} »`);
  equal(v.lieu, 'tortue', 'le voyage a bougé malgré le refus');
});

test('every reachable place says what it is before you sail', () => {
  const v = V.nouveauVoyage();
  const bad = [];
  for (const e of V.escales(v)) {
    if (!e.escale || !e.escale.nom || !e.escale.quoi) bad.push(`${e.id} (${e.type}) ne dit pas ce qu'il est`);
    if (!e.note) bad.push(`${e.id} n'a pas de note`);
  }
  assert(V.escales(v).length > 0, 'aucune escale au départ');
  empty(bad, 'escales muettes');
});

test('the theatre widens, it does not open all at once', () => {
  const v = V.nouveauVoyage();
  const bad = V.escales(v).filter((e) => e.act > 2).map((e) => e.id);
  empty(bad, 'places from act 3 already reachable from the start');
});

test('sailing advances the act when the place belongs to a later one', () => {
  const v = V.nouveauVoyage();
  const suivant = V.escales(v).find((e) => e.act === 2);
  if (!suivant) return;
  V.cingler(v, suivant.id);
  equal(v.acte, 2, 'l’acte n’a pas suivi le lieu');
});

test('a sea route never crosses the heart of an island', () => {
  // Le trait droit passait au travers d'Hispaniola et de Cuba. Une carte
  // fausse n'apprend pas la mer qu'elle prétend faire apprendre.
  const { routeEntre, coastlines } = C2;
  const coeurs = coastlines().filter((c) => c.closed).map((c) => {
    const n = c.points.length;
    return {
      x: c.points.reduce((s, p) => s + p.x, 0) / n,
      y: c.points.reduce((s, p) => s + p.y, 0) / n,
    };
  });
  const bad = [];
  const v = V.nouveauVoyage();
  for (const e of V.escales(v)) {
    const route = routeEntre(placeById(v.lieu), e);
    for (const coeur of coeurs) {
      // Aucun point de la route ne doit tomber à moins de 2 % du centre d'une
      // île : c'est le cœur des terres, pas une côte qu'on longe.
      if (route.some((p) => Math.hypot(p.x - coeur.x, p.y - coeur.y) < 0.02)) {
        bad.push(`${v.lieu} → ${e.id} traverse le centre d'une île`);
      }
    }
  }
  empty(bad, 'routes across land');
});

test('a coastal hop stays straight', () => {
  // Contourner ce qu'on longe donnait des boucles absurdes : deux escales
  // voisines sur la même côte se rejoignent tout droit.
  const { routeEntre } = C2;
  const a = placeById('tortue'), b = placeById('port_margot');
  const route = routeEntre(a, b);
  const mid = route[Math.floor(route.length / 2)];
  const droit = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  assert(Math.hypot(mid.x - droit.x, mid.y - droit.y) < 0.02,
    'un saut le long de la côte fait un détour');
});

suite('voyage — ce qu’on trouve');

test('a hunt yields a prize that escalates with the voyage', () => {
  const v = V.nouveauVoyage();
  const lieu = places().find((p) => p.type === 'chasse');
  const tot = V.priseDe(v, lieu, CONTENU, rngFor(7));
  v.etapes = 10; v.acte = 3;
  const tard = V.priseDe(v, lieu, CONTENU, rngFor(7));
  assert(tard.pv > tot.pv, `la prise tardive (${tard.pv}) n'est pas plus dure que la première (${tot.pv})`);
  assert(tard.butin >= tot.butin, 'une prise tardive ne rapporte pas plus');
  assert(tot.nom && tot.lieu, 'la prise n’a ni nom ni lieu');
});

test('the flagship is the hardest thing on the chart', () => {
  const v = V.nouveauVoyage(); v.acte = 3; v.etapes = 8;
  const boss = places().find((p) => p.type === 'boss');
  if (!boss) return;
  const amiral = V.priseDe(v, boss, CONTENU, rngFor(3));
  const ordinaire = V.priseDe(v, places().find((p) => p.type === 'chasse' && p.act === 3), CONTENU, rngFor(3));
  assert(amiral.resistance > ordinaire.resistance, 'l’Almirante n’est pas plus dure qu’une prise ordinaire');
  equal(amiral.nom, 'L’Almirante', 'le vaisseau amiral a perdu son nom');
});

test('a wreck never hands out the same thing twice', () => {
  const P = { reliques: [], hommes: [] };
  const rng = rngFor(11);
  const vus = new Set();
  for (let i = 0; i < 5; i++) {
    const t = V.trouvaille(P, CONTENU, rng);
    if (!t) break;
    assert(!vus.has(t.def.id), `${t.def.id} trouvé deux fois`);
    vus.add(t.def.id);
    (t.genre === 'relique' ? P.reliques : P.hommes).push(t.def.id);
    if (P.hommes.length >= 5) break;
  }
  assert(vus.size >= 3, 'les épaves ne rendent presque rien');
});

test('every encounter offers two branches, each stating its outcome', () => {
  const bad = [];
  for (const r of V.RENCONTRES) {
    if (!r.titre || !r.texte) bad.push(`${r.id} sans texte`);
    if (r.branches.length !== 2) bad.push(`${r.id} n'a pas deux branches`);
    for (const b of r.branches) if (!b.texte || !b.dit || !b.gain) bad.push(`${r.id} → branche muette`);
  }
  empty(bad, 'encounters that hide their outcome');
});
