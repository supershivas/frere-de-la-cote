// La chasse-partie en cartes (proposition E). Deux natures de tests ici :
//
//  - les invariants (pas de dé dans la résolution, hiérarchie des manœuvres,
//    intégrité de data/equipage.json) ;
//  - et la seule question qui décide si le jeu vaut quelque chose : est-ce que
//    CHOISIR compte ? Un joueur qui lit sa main doit gagner nettement plus
//    qu'un joueur qui jette cinq cartes au hasard. Si les deux courbes se
//    touchent, la main n'est pas un problème, c'est une formalité — et le
//    seuil qui casse ici est une décision de conception, pas un test à
//    assouplir.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import * as C from '../src/cartes.js';

const CONTENU = JSON.parse(readFileSync(new URL('../data/equipage.json', import.meta.url), 'utf8'));
const METEO = JSON.parse(readFileSync(new URL('../data/weather.json', import.meta.url), 'utf8'));

const rngFor = (seed) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};

suite('cartes — invariants');

test('the rules never reach for a die', () => {
  const code = readFileSync(new URL('../src/cartes.js', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
  const bad = [];
  for (const interdit of ['Math.random', 'Date.now', 'crypto']) {
    if (code.includes(interdit)) bad.push(`src/cartes.js contient ${interdit}`);
  }
  empty(bad, 'entropy inside the resolution');
});

test('the manoeuvre table is a strict hierarchy', () => {
  const produits = C.MANOEUVRES.map((m) => m.base * m.mult);
  const fautes = [];
  for (let i = 1; i < produits.length; i++) {
    if (produits[i] >= produits[i - 1]) {
      fautes.push(`${C.MANOEUVRES[i].nom} (${produits[i]}) ne vaut pas moins que ${C.MANOEUVRES[i - 1].nom} (${produits[i - 1]})`);
    }
  }
  empty(fautes, 'the table order does not match the payouts');
});

test('the same volley scored twice gives the same number', () => {
  const P = C.nouvellePartie(CONTENU);
  C.engager(P, CONTENU.prises[1], METEO.brume, rngFor(7));
  const cartes = P.main.slice(0, 4);
  equal(C.evaluer(P, cartes).points, C.evaluer(P, cartes).points, 'evaluation drifted');
});

test('the same seed played the same way ends the same way', () => {
  const jouer = (seed) => {
    const P = C.nouvellePartie(CONTENU);
    const rng = rngFor(seed);
    C.engager(P, CONTENU.prises[2], METEO.calme, rng);
    while (!P.fini) {
      const b = C.meilleureVolee(P);
      P.selection = b.cartes;
      C.jouer(P);
      C.completer(P, rng);
    }
    return `${P.fini}/${P.prise.pv}/${P.butin}`;
  };
  equal(jouer(31337), jouer(31337), 'two identical runs diverged');
});

test('an impossible order says no out loud', () => {
  const P = C.nouvellePartie(CONTENU);
  C.engager(P, CONTENU.prises[0], METEO.calme, rngFor(3));
  equal(C.jouer(P), false, 'playing an empty selection should be refused');
  equal(C.largage(P), false, 'discarding nothing should be refused');
  P.selection = P.main.slice(0, 5);
  equal(C.selectionner(P, P.main[5]), false, 'a sixth card should be refused');
  equal(C.recruter(P, CONTENU.recrues[0]), false, 'recruiting without loot should be refused');
});

suite('cartes — contenu');

test('every crew card names a role that exists', () => {
  const roles = Object.keys(CONTENU.roles);
  const bad = [];
  for (const c of [...CONTENU.equipage, ...CONTENU.recrues]) {
    if (!roles.includes(c.role)) bad.push(`${c.id} → rôle inconnu « ${c.role} »`);
    if (!Object.keys(CONTENU.quarts).includes(c.quart)) bad.push(`${c.id} → quart inconnu « ${c.quart} »`);
    if (c.id !== c.id.toLowerCase()) bad.push(`${c.id} → identifiant non normalisé`);
  }
  empty(bad, 'crew entries pointing at nothing');
});

test('identifiers are unique across the whole file', () => {
  const vus = new Set(); const bad = [];
  for (const [zone, liste] of [['equipage', CONTENU.equipage], ['recrues', CONTENU.recrues],
    ['prises', CONTENU.prises], ['reliques', CONTENU.reliques]]) {
    for (const e of liste) {
      const k = `${zone}:${e.id}`;
      if (vus.has(k)) bad.push(k);
      vus.add(k);
    }
  }
  empty(bad, 'duplicate identifiers');
});

test('every prize rule is defined', () => {
  const bad = CONTENU.prises.filter((p) => p.regle && !CONTENU.regles[p.regle]).map((p) => `${p.id} → ${p.regle}`);
  empty(bad, 'prize rules with no definition');
});

test('the prizes climb', () => {
  // L'objectif brut ne suffit pas à dire la difficulté : une prise à trois
  // bordées est plus dure qu'une prise à quatre pour le même chiffre. Ce qui
  // doit monter, c'est l'objectif RAPPORTÉ AU NOMBRE DE VOLÉES, et le butin.
  const bad = [];
  const par = (p) => p.objectif / p.bordees;
  for (let i = 1; i < CONTENU.prises.length; i++) {
    if (par(CONTENU.prises[i]) <= par(CONTENU.prises[i - 1])) bad.push(`${CONTENU.prises[i].id} (objectif par volée)`);
    if (CONTENU.prises[i].butin <= CONTENU.prises[i - 1].butin) bad.push(`${CONTENU.prises[i].id} (butin)`);
  }
  empty(bad, 'prizes that do not escalate');
});

suite('cartes — est-ce que choisir compte ?');

// Le joueur appliqué joue sa meilleure volée ; le maladroit joue cinq cartes
// prises dans l'ordre où elles sont tombées. Les deux jouent exactement les
// mêmes mains, sur les mêmes graines.
function partie(prise, seed, applique) {
  const P = C.nouvellePartie(CONTENU);
  const rng = rngFor(seed);
  C.engager(P, prise, METEO.brise, rng);
  while (!P.fini) {
    P.selection = applique ? C.meilleureVolee(P).cartes : P.main.slice(0, C.MAIN_MAX);
    C.jouer(P);
    C.completer(P, rng);
  }
  return P.fini === 'prise';
}

test('a careful captain takes the merchantman far more often than a careless one', () => {
  const prise = CONTENU.prises[1];
  let bons = 0, mauvais = 0;
  for (let s = 1; s <= 60; s++) {
    if (partie(prise, s * 977, true)) bons++;
    if (partie(prise, s * 977, false)) mauvais++;
  }
  assert(bons >= 50, `le joueur appliqué ne prend la flûte que ${bons}/60 — la manche est trop dure`);
  assert(mauvais <= 20, `le joueur maladroit la prend ${mauvais}/60 — le choix ne compte pas`);
  assert(bons - mauvais >= 30, `écart de seulement ${bons - mauvais} sur 60 entre appliqué et maladroit`);
});

test('the line-of-battle ship is out of reach of a starting crew', () => {
  const prise = CONTENU.prises[4];
  let bons = 0;
  for (let s = 1; s <= 40; s++) if (partie(prise, s * 613, true)) bons++;
  assert(bons <= 10, `le vaisseau tombe ${bons}/40 avec l'équipage de départ — la progression n'a rien à vendre`);
});
