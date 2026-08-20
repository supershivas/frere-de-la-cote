// La chasse-partie en cartes. Trois natures de tests :
//
//  - les invariants (pas de dé dans la résolution, refus motivés, contenu
//    cohérent) ;
//  - la promesse du tour : ce que la prise fera est annoncé AVANT qu'on joue,
//    et abattre un mât l'empêche vraiment. Si l'annonce ment, le tour redevient
//    un pari et tout le reste ne sert à rien ;
//  - et la question qui décide si le jeu vaut quelque chose : est-ce que
//    CHOISIR compte ? Un joueur qui lit sa main doit gagner nettement plus
//    qu'un joueur qui joue les cartes dans l'ordre où elles tombent. Un seuil
//    qui casse là est une décision de conception, pas un test à assouplir.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import * as C from '../src/cartes.js';

const CONTENU = JSON.parse(readFileSync(new URL('../data/equipage.json', import.meta.url), 'utf8'));
const METEO = JSON.parse(readFileSync(new URL('../data/weather.json', import.meta.url), 'utf8'));

const rngFor = (seed) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};
const partie = (prise, seed, meteo = METEO.brise) => {
  const P = C.nouvellePartie(CONTENU);
  const rng = rngFor(seed);
  C.engager(P, prise, meteo, rng);
  return { P, rng };
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

test('the same volley scored twice gives the same number', () => {
  const { P } = partie(CONTENU.prises[1], 7, METEO.brume);
  const cartes = P.main.filter((c) => C.peutJouer(P, c).ok).slice(0, 3);
  equal(C.evaluer(P, cartes).total, C.evaluer(P, cartes).total, 'evaluation drifted');
});

test('the same seed played the same way ends the same way', () => {
  const jouer = (seed) => {
    const { P, rng } = partie(CONTENU.prises[2], seed);
    let garde = 0;
    while (!P.fini && garde++ < 60) {
      const b = C.meilleureVolee(P);
      if (!b) { C.riposter(P); C.completer(P, rng); continue; }
      P.selection = b.cartes; C.jouer(P); C.riposter(P); C.completer(P, rng);
    }
    return `${P.fini}/${P.prise.pv}/${P.nous.pv}`;
  };
  equal(jouer(31337), jouer(31337), 'two identical runs diverged');
});

test('an impossible order says why, out loud', () => {
  const { P } = partie(CONTENU.prises[0], 3);
  equal(C.recruter(P, CONTENU.recrues[0]).ok, false, 'recruiting without loot should be refused');

  // Une volée ne mêle pas les deux bords, et le refus doit le dire.
  const premier = P.main.find((c) => !C.estFeu(c));
  C.selectionner(P, premier);
  const enFace = P.main.find((c) => !C.estFeu(c) && C.bordDe(CONTENU, c) !== C.bordDe(CONTENU, premier));
  if (enFace) {
    const r = C.selectionner(P, enFace);
    equal(r.ok, false, 'mixing both sides should be refused');
    assert(/bord/i.test(r.pourquoi), `le refus n'explique pas le bord : « ${r.pourquoi} »`);
  }
});

test('the side that just fired has to reload — when they were several', () => {
  const { P } = partie(CONTENU.prises[0], 11);
  const b = C.meilleureVolee(P);
  if (b.cartes.filter((c) => !C.estFeu(c)).length < 2) return; // un homme seul recharge à temps
  P.selection = b.cartes;
  const bord = C.bordDeLaVolee(P, b.cartes);
  C.jouer(P);
  equal(P.encrasse, bord, 'the side that fired is not fouled');
  const encore = P.main.find((c) => !C.estFeu(c) && C.bordDe(CONTENU, c) === bord);
  if (encore) equal(C.peutJouer(P, encore).ok, false, 'a fouled side can still fire');
});

test('the hand is relieved three at a time, never refilled', () => {
  // C'est la seule chose qui fasse du choix un choix : brûler cinq hommes
  // maintenant, c'est tirer à deux le tour prochain. Tant que la main se
  // remplissait à ras bord, jouer cinq cartes était toujours la bonne réponse
  // et il n'y avait rien à décider — mesuré, et corrigé par la relève.
  const { P, rng } = partie(CONTENU.prises[1], 13);
  equal(P.main.length, C.tailleMain(P), 'la main d’engagement n’est pas pleine');
  P.selection = P.main.filter((c) => C.peutJouer(P, c).ok).slice(0, C.MAIN_MAX);
  const joues = P.selection.length;
  C.jouer(P); C.riposter(P);
  const avant = P.main.length;
  C.completer(P, rng);
  equal(P.main.length, Math.min(C.tailleMain(P), avant + C.RELEVE),
    `la relève a rendu ${P.main.length - avant} hommes au lieu de ${C.RELEVE}`);
  if (joues > C.RELEVE) {
    assert(P.main.length < C.tailleMain(P),
      'une volée pleine n’a rien coûté à la main du tour suivant');
  }
});

test('one man alone does not foul his side, and a stuck hand always has a shot', () => {
  // Deux soupapes du rechargement, toutes deux nées d'une main de cinq cartes :
  // un homme seul recharge à temps (sinon une grosse volée n'a pas de contraire),
  // et si aucun homme du bord libre n'est en main, le bord encrassé reprend le
  // service — sans quoi le joueur passait des tours entiers sans coup à jouer,
  // et un tour perdu n'est pas une décision.
  const { P } = partie(CONTENU.prises[0], 29);
  const seul = P.main.find((c) => !C.estFeu(c));
  P.selection = [seul];
  C.jouer(P);
  equal(P.encrasse, null, 'un homme seul a encrassé son bord');

  const Q = partie(CONTENU.prises[0], 31).P;
  const bord = C.bordDe(CONTENU, Q.main.find((c) => !C.estFeu(c)));
  Q.encrasse = bord;
  Q.main = Q.main.filter((c) => C.estFeu(c) || C.bordDe(CONTENU, c) === bord);
  assert(Q.main.some((c) => C.peutJouer(Q, c).ok), 'une main d’un seul bord encrassé ne peut plus rien jouer');
});

suite('cartes — la promesse du tour');

test('the prize announces her blow before it lands', () => {
  const { P } = partie(CONTENU.prises[1], 5);
  const annonce = P.prise.annonce;
  assert(annonce && annonce.nom && annonce.texte, 'aucune intention annoncée au premier tour');
  const b = C.meilleureVolee(P);
  P.selection = b.cartes; C.jouer(P);
  const r = C.riposter(P);
  equal(r.intention.id, annonce.id, 'the blow that landed is not the one announced');
});

test('shooting the rigging really cancels the announced blow', () => {
  // On force une prise dont l'intention d'ouverture est un coup de canon, puis
  // on tire au gréement : le coup annoncé ne doit pas partir.
  let trouve = false;
  for (let s = 1; s <= 80 && !trouve; s++) {
    const { P } = partie({ ...CONTENU.prises[2], mats: 3 }, s * 31);
    if (P.prise.annonce.effet !== 'canon') continue;
    const g = C.meilleureVolee(P, { viser: 'greement' });
    if (!g || !g.abat) continue;
    trouve = true;
    const avant = P.nous.pv;
    P.selection = g.cartes;
    const j = C.jouer(P);
    equal(j.cible, 'greement', 'the volley did not aim at the rigging');
    equal(P.prise.mats, 2, 'no mast came down');
    const r = C.riposter(P);
    equal(r.annulee, true, 'the announced blow still landed');
    equal(P.nous.pv, avant, 'La Tortue took damage from a cancelled blow');
  }
  assert(trouve, 'aucune graine ne produit un tir au gréement — le cas de test ne teste rien');
});

test('a mast is a reprieve, not a switch: it grows back', () => {
  // Un mât définitivement perdu faisait de la mise à mal du gréement la seule
  // tactique du jeu — y compris pour un joueur qui l'atteignait par hasard.
  // Il se regrée, et la prise tire plus faiblement en attendant.
  const { P, rng } = partie({ ...CONTENU.prises[2], pv: 99999 }, 17);
  const g = C.meilleureVolee(P, { viser: 'greement' });
  if (!g || !g.abat) return;
  const mats0 = P.prise.mats;
  P.selection = g.cartes; C.jouer(P);
  equal(P.prise.mats, mats0 - 1, 'no mast came down');
  C.riposter(P); C.completer(P, rng);
  C.riposter(P); C.completer(P, rng);
  equal(P.prise.mats, mats0, 'the mast never grew back');
});

test('the fireship card actually reaches the hand', () => {
  // On pioche avec `pop()` : la FIN du tableau est le dessus du paquet. Mise en
  // tête avec `unshift`, la carte Feu partait au fond de la pioche et
  // n'arrivait jamais — l'effet le plus visible de la prise était invisible.
  const brulot = CONTENU.intentions.find((i) => i.effet === 'brulot');
  const { P, rng } = partie(CONTENU.prises[1], 41);
  P.prise.annonce = brulot;
  const feux = () => [...P.main, ...P.pioche, ...P.defausse].filter(C.estFeu).length;
  equal(feux(), 0, 'un Feu traînait déjà');
  C.riposter(P);
  equal(feux(), 1, 'le brûlot n’a mis aucune carte Feu dans le jeu');
  P.main = [];                       // on force la relève à piocher
  C.completer(P, rng, 1);
  equal(P.main.filter(C.estFeu).length, 1, 'la carte Feu n’est pas arrivée en main au tirage suivant');
});

test('grapeshot hits the best man in hand, not a man at random', () => {
  const mitraille = CONTENU.intentions.find((i) => i.effet === 'mitraille');
  const { P } = partie(CONTENU.prises[1], 23);
  P.prise.annonce = mitraille;
  const attendu = P.main.filter((c) => !C.estFeu(c)).sort((a, b) => C.valeur(b) - C.valeur(a) || a.uid - b.uid)[0];
  C.riposter(P);
  equal(attendu.blesse, true, 'grapeshot did not hit the announced target');
});

test('an officer changes a rule, and three at most sit at the table', () => {
  // La barque n'a pas de règle : on mesure l'officier, pas la prise. (Sur la
  // flûte, « un homme seul ne l'entame pas » ramenait les deux comptes à zéro
  // et le test passait pour une mauvaise raison.)
  const { P } = partie(CONTENU.prises[0], 53);
  const bosco = CONTENU.officiers.find((o) => o.id === 'bosco');
  const canon = P.main.find((c) => !C.estFeu(c) && c.role === 'canonnier');
  if (!canon) return;
  const avant = C.evaluer(P, [canon]).total;
  P.butin = 99;
  equal(C.engagerOfficier(P, bosco).ok, true, 'le Bosco a refusé de monter à bord');
  assert(C.evaluer(P, [canon]).total > avant, 'le Bosco ne change rien au compte d’un canonnier');
  equal(C.engagerOfficier(P, bosco).ok, false, 'le même officier a été engagé deux fois');
  for (const o of CONTENU.officiers.filter((x) => x.id !== 'bosco').slice(0, 2)) {
    equal(C.engagerOfficier(P, o).ok, true, `${o.id} refusé alors qu'il reste de la place`);
  }
  const detrop = CONTENU.officiers.find((o) => !P.officiers.includes(o.id));
  equal(C.engagerOfficier(P, detrop).ok, false, 'un quatrième officier a pu monter à bord');
});

suite('cartes — contenu');

test('every crew card names a role and a quarter that exist', () => {
  const roles = Object.keys(CONTENU.roles);
  const quarts = Object.keys(CONTENU.quarts);
  const bad = [];
  for (const c of [...CONTENU.equipage, ...CONTENU.recrues]) {
    if (!roles.includes(c.role)) bad.push(`${c.id} → rôle inconnu « ${c.role} »`);
    if (!quarts.includes(c.quart)) bad.push(`${c.id} → quart inconnu « ${c.quart} »`);
  }
  for (const [id, q] of Object.entries(CONTENU.quarts)) {
    if (!CONTENU.bords[q.bord]) bad.push(`quart ${id} → bord inconnu « ${q.bord} »`);
    if (!['avant', 'arriere'].includes(q.bout)) bad.push(`quart ${id} → bout inconnu « ${q.bout} »`);
  }
  empty(bad, 'entries pointing at nothing');
});

test('both sides of the ship are playable, in both halves', () => {
  // Un bord qui n'aurait presque personne rendrait le rechargement injouable.
  const compte = {};
  for (const c of CONTENU.equipage) {
    const q = CONTENU.quarts[c.quart];
    compte[q.bord] = (compte[q.bord] || 0) + 1;
  }
  const bad = Object.entries(compte).filter(([, n]) => n < 5).map(([b, n]) => `${b} : ${n} hommes`);
  empty(bad, 'a side with too few men to fire on its turn');
});

test('every officer has a name, a text and a price', () => {
  const bad = [];
  for (const o of CONTENU.officiers) {
    if (!o.nom || !o.texte || !o.prix) bad.push(`officier ${o.id} incomplet`);
  }
  empty(bad, 'officers with nothing to say');
});

test('every prize rule and intention is defined', () => {
  const bad = CONTENU.prises.filter((p) => p.regle && !CONTENU.regles[p.regle]).map((p) => `${p.id} → ${p.regle}`);
  for (const i of CONTENU.intentions) {
    if (!i.nom || !i.texte || !i.effet) bad.push(`intention ${i.id} incomplète`);
  }
  empty(bad, 'dangling references');
});

test('the prizes climb', () => {
  const bad = [];
  for (let i = 1; i < CONTENU.prises.length; i++) {
    const a = CONTENU.prises[i - 1], b = CONTENU.prises[i];
    if (b.pv <= a.pv) bad.push(`${b.id} (coque)`);
    if (b.riposte <= a.riposte) bad.push(`${b.id} (riposte)`);
    if (b.butin <= a.butin) bad.push(`${b.id} (butin)`);
  }
  empty(bad, 'prizes that do not escalate');
});

suite('cartes — est-ce que choisir compte ?');

// LA QUESTION LA PLUS IMPORTANTE DU JEU. Tant que « la volée la plus forte »
// était toujours la bonne réponse, il n'y avait pas de décision : le joueur
// exécutait un calcul, il ne choisissait rien. La cargaison introduit une
// seconde monnaie — chaque point de coque coûte du butin, le gréement et
// l'abordage n'en coûtent aucun — et les deux monnaies ne se convertissent
// pas l'une dans l'autre. Ce test vérifie que les deux façons de jouer
// existent VRAIMENT : la rapide et la soigneuse, et qu'aucune ne domine.
function chasser(prise, seed, style) {
  const { P, rng } = partie(prise, seed);
  let garde = 0;
  while (!P.fini && garde++ < 80) {
    const d = C.meilleureVolee(P, { max: C.RELEVE });
    const cartes = style === 'soigneux'
      ? (C.meilleureVolee(P, { max: C.MAIN_MAX, viser: 'abordage' }) || d)
      : d;
    if (!cartes || !cartes.cartes.length) { P.selection = []; C.riposter(P); C.completer(P, rng); continue; }
    P.selection = cartes.cartes;
    C.jouer(P);
    if (!P.fini) C.riposter(P);
    C.completer(P, rng);
  }
  return { pris: P.fini === 'prise', butin: P.butin, tours: P.tour };
}

test('sparing the cargo pays, and costs turns — neither way dominates', () => {
  const prise = CONTENU.prises[0];
  const vite = [], soin = [];
  for (let s = 1; s <= 60; s++) {
    const a = chasser(prise, s * 977, 'rapide');
    const b = chasser(prise, s * 977, 'soigneux');
    if (a.pris) vite.push(a);
    if (b.pris) soin.push(b);
  }
  const med = (l, k) => l.map((x) => x[k]).sort((x, y) => x - y)[Math.floor(l.length / 2)];
  const bVite = med(vite, 'butin'), bSoin = med(soin, 'butin');
  const tVite = med(vite, 'tours'), tSoin = med(soin, 'tours');
  console.log(`      rapide : ${bVite} 💰 en ${tVite} tours · soigneux : ${bSoin} 💰 en ${tSoin} tours`);

  assert(bSoin > bVite, `ménager la cargaison ne rapporte pas plus (${bSoin} contre ${bVite}) — la seconde monnaie ne sert à rien`);
  assert(bSoin - bVite >= 3, `l'écart de butin n'est que de ${bSoin - bVite} : trop petit pour peser dans une décision`);
  assert(tSoin > tVite, `ménager la cargaison ne coûte aucun tour (${tSoin} contre ${tVite}) — ce n'est pas un choix, c'est une meilleure façon de jouer`);
  assert(vite.length >= 45, `le capitaine rapide ne prend la barque que ${vite.length}/60`);
  assert(soin.length >= 40, `le capitaine soigneux ne prend la barque que ${soin.length}/60 — trop punitif pour être une option`);
});

test('a boarded prize is worth more than a sunk one', () => {
  // Sur la même prise, au même point de coque : sauter à bord garde la
  // cargaison entière ET rapporte une prime. Couler au canon ne rapporte que
  // ce qui flotte.
  const { P } = partie(CONTENU.prises[0], 5);
  const avant = P.prise.butin;
  P.prise.pv = 12;                     // coque basse : l'abordage est ouvert
  const abordeurs = P.main.filter((c) => !C.estFeu(c) && c.role === 'abordeur');
  if (abordeurs.length < 2) return;
  P.selection = abordeurs.slice(0, 2);
  equal(C.evaluer(P, P.selection).cible, 'abordage', 'deux abordeurs sur une coque basse ne sautent pas à bord');
  equal(C.evaluer(P, P.selection).gate, 0, 'un abordage gâte la cargaison');
  C.jouer(P);
  equal(P.fini, 'prise', 'l’abordage n’a pas emporté la prise');
  assert(P.butin > avant, `prise à l'abordage, elle rapporte ${P.butin} alors qu'elle portait ${avant}`);
});

// Les deux capitaines jouent exactement les mêmes mains, sur les mêmes graines.
// L'appliqué lit sa main ; le maladroit prend les premières cartes jouables.
function duel(prise, seed, applique) {
  const { P, rng } = partie(prise, seed);
  let garde = 0;
  while (!P.fini && garde++ < 80) {
    let cartes;
    if (applique) {
      // L'appliqué fait deux choses que le maladroit ne fait pas : il MÉNAGE
      // sa main (au plus une relève par volée, sinon il tirera à deux le tour
      // suivant), et il monte au gréement quand le coup annoncé coûte plus
      // cher que ce qu'il renonce à infliger.
      const g = C.meilleureVolee(P, { viser: 'greement', max: C.RELEVE });
      const d = C.meilleureVolee(P, { max: C.RELEVE });
      const a = P.prise.annonce;
      const evite = a.effet === 'canon' && !P.prise.tirAnnule
        ? Math.round(P.prise.riposte * a.force * (0.5 + 0.5 * (P.prise.mats / P.prise.matsMax))) : 0;
      cartes = (g && g.abat && evite > (d ? d.degats : 0) + 4) ? g.cartes : (d ? d.cartes : null);
    } else {
      cartes = [];
      for (const c of P.main) {
        if (cartes.length >= C.MAIN_MAX) break;
        const r = C.selectionner(P, c);
        if (r.ok) cartes.push(c);
      }
      cartes = P.selection.slice();
    }
    if (!cartes || !cartes.length) { P.selection = []; C.riposter(P); C.completer(P, rng); continue; }
    P.selection = cartes;
    C.jouer(P);
    if (!P.fini) C.riposter(P);
    C.completer(P, rng);
  }
  return P.fini === 'prise';
}

test('a careful captain takes the merchantman far more often than a careless one', () => {
  const prise = CONTENU.prises[1];
  let bons = 0, mauvais = 0;
  for (let s = 1; s <= 60; s++) {
    if (duel(prise, s * 977, true)) bons++;
    if (duel(prise, s * 977, false)) mauvais++;
  }
  console.log(`      appliqué : ${bons}/60 · maladroit : ${mauvais}/60`);
  assert(bons >= 30, `le joueur appliqué ne prend la flûte que ${bons}/60 — la manche est trop dure`);
  assert(mauvais <= 36, `le joueur maladroit la prend ${mauvais}/60 — le choix ne compte pas`);
  assert(bons - mauvais >= 14, `écart de seulement ${bons - mauvais} sur 60 entre appliqué et maladroit`);
});

test('the line-of-battle ship is out of reach of a starting crew', () => {
  let bons = 0;
  for (let s = 1; s <= 40; s++) if (duel(CONTENU.prises[4], s * 613, true)) bons++;
  assert(bons <= 8, `le vaisseau tombe ${bons}/40 avec l'équipage de départ — la progression n'a rien à vendre`);
});
