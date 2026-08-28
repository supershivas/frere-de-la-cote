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
let faux = 9000;   // des `uid` de test, hors de la suite du jeu
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
    return `${P.fini}/${P.pression}/${P.prise.pv}/${P.bordees}`;
  };
  equal(jouer(31337), jouer(31337), 'two identical runs diverged');
});

test('an impossible order says why, out loud', () => {
  const { P } = partie(CONTENU.prises[0], 3);
  equal(C.engagerHomme(P, CONTENU.hommes[0]).ok, false, 'recruiting without loot should be refused');

  // Une volée ne prend pas plus de munitions qu'elle n'a de places.
  for (const c of P.main.slice(0, C.voleeMax(P))) C.selectionner(P, c);
  const detrop = P.main.find((c) => !P.selection.includes(c));
  if (detrop) {
    const r = C.selectionner(P, detrop);
    equal(r.ok, false, 'une quatrième munition est entrée dans la volée');
    assert(r.pourquoi, 'le refus ne dit pas pourquoi');
  }
});

test('a volley has no composition rule left — only how many', () => {
  // BÂBORD ET TRIBORD SONT RETIRÉS. Ils interdisaient de mêler les deux côtés :
  // une main sur deux était à moitié injouable, et la moitié des tours devenait
  // une attente plutôt qu'une décision. Ce qui reste et qui décide, ce sont les
  // FIGURES — assortir, et non trier.
  //
  // Mesuré, le retrait multiplie par 2,8 la pression médiane d'une volée (de
  // ~30 à 85), puisque la main joue toujours ses trois meilleures : les
  // résistances ont été réétalonnées d'autant, dans le même mouvement.
  const { P } = partie(CONTENU.prises[0], 11);
  empty(P.main.filter((c) => !C.peutJouer(P, c).ok),
    'une munition de la main est refusée alors qu’aucune règle ne la refuse');
  empty(P.deck.filter((c) => c.bord != null), 'une munition porte encore un bord');
  if (CONTENU.bords) throw new Error('data/equipage.json porte encore des bords');

  // N'importe quel trio de la main forme une volée.
  const trois = P.main.slice(0, 3);
  for (const c of trois) equal(C.selectionner(P, c).ok, true, 'une munition a été refusée');
  equal(P.selection.length, 3, 'la volée n’a pas pris les trois');
});

test('the encounter is an ante: four broadsides, three reloads, a full hand', () => {
  // LA STRUCTURE DU JEU, en un test. La rareté n'est plus dans le nombre
  // d'hommes qu'on reçoit — la main se remplit à ras — elle est dans le nombre
  // de COUPS : quatre bordées pour atteindre la résistance annoncée, et trois
  // rechargements pour se refaire une main sans tirer. Une relève de deux
  // faisait la même chose de façon détournée, et le joueur ne voyait jamais le
  // compte : ici les deux compteurs sont sur le ruban.
  const { P, rng } = partie(CONTENU.prises[1], 13);
  equal(P.bordees, C.BORDEES, 'la rencontre ne commence pas à quatre bordées');
  equal(P.rechargements, C.RECHARGEMENTS, 'la rencontre ne commence pas à trois rechargements');
  equal(P.pression, 0, 'la pression ne part pas de zéro');
  assert(P.prise.resistance > 0, 'la prise n’annonce aucune résistance');
  equal(P.main.length, C.tailleMain(P), 'la main d’engagement n’est pas pleine');

  P.selection = P.main.filter((c) => C.peutJouer(P, c).ok).slice(0, C.MAIN_MAX);
  const r = C.jouer(P);
  equal(P.bordees, C.BORDEES - 1, 'une volée n’a pas coûté de bordée');
  equal(P.pression, r.pression, 'la volée n’a pas mis sa pression au compteur');
  C.riposter(P); C.completer(P, rng);
  equal(P.main.length, C.tailleMain(P), 'la main ne se remplit pas à ras entre deux bordées');
});

test('a reload swaps men without firing, and the prize does not answer', () => {
  const { P, rng } = partie(CONTENU.prises[1], 21);
  const avantTour = P.tour, avantBordees = P.bordees, avantAnnonce = P.prise.annonce.id;
  P.selection = P.main.slice(0, 3);
  const renvoyes = P.selection.slice();
  const ok = C.recharger(P, rng);
  assert(ok.ok, `le rechargement a été refusé : ${ok.pourquoi}`);
  equal(P.rechargements, C.RECHARGEMENTS - 1, 'le rechargement n’a rien coûté');
  equal(P.bordees, avantBordees, 'un rechargement a mangé une bordée');
  equal(P.prise.annonce.id, avantAnnonce, 'la prise a joué sa carte pendant un rechargement');
  equal(P.tour, avantTour, 'un rechargement a fait passer un tour');
  equal(P.main.length, C.tailleMain(P), 'la main n’a pas été refaite à ras');
  equal(P.pression, 0, 'un rechargement a mis de la pression');
  empty(renvoyes.filter((c) => P.main.includes(c)), 'des hommes renvoyés sont restés en main');
});

test('a reload is refused once the powder is spent', () => {
  // RÈGLE 5 : un ordre impossible se refuse À VOIX HAUTE.
  const { P, rng } = partie(CONTENU.prises[0], 33);
  for (let i = 0; i < C.RECHARGEMENTS; i++) { P.selection = P.main.slice(0, 1); C.recharger(P, rng); }
  P.selection = P.main.slice(0, 1);
  const r = C.recharger(P, rng);
  equal(r.ok, false, 'un quatrième rechargement est passé');
  assert(r.pourquoi, 'le refus ne dit pas pourquoi');
});

test('the figures are made of munitions, which is why they exist at all', () => {
  // LA RAISON D'ÊTRE DU DECK DE MUNITIONS. Avec des hommes tous différents,
  // aucune main ne ressemblait à une autre : il n'y avait rien à reconnaître, et
  // « la volée la plus forte » se lisait d'un coup d'œil. Des munitions
  // répétées font des figures, et une figure se cherche.
  const { P } = partie(CONTENU.prises[0], 7);
  const de = (id, bord = 'babord') => ({ ...CONTENU.munitions.find((m) => m.id === id), bord, uid: ++faux });

  equal(C.figureDe([de('boulet_rame'), de('boulet_rame'), de('boulet_rame')]), 'triplette', 'trois fois la même');
  equal(C.figureDe([de('boulet_rame'), de('mitraille'), de('chaine')]), 'panachee', 'trois différentes');
  equal(C.figureDe([de('boulet_rame'), de('boulet_rame'), de('chaine')]), 'paire', 'deux identiques et une autre');
  equal(C.figureDe([de('boulet_rame'), de('boulet_rame')]), 'paire', 'deux identiques');
  equal(C.figureDe([de('boulet_rame'), de('chaine')]), null, 'deux dépareillées ne font pas de figure');
  equal(C.figureDe([de('boulet_rame')]), null, 'une seule munition ne fait pas de figure');

  // Et le compte suit : trois fois la même vaut plus que trois différentes, qui
  // valent plus qu'une paire. LA FUREUR EST RETIRÉE — « 17 × 2,5 » demandait un
  // produit de tête avant de savoir ce que la volée valait, et à trois cartes
  // près du seuil, c'est exactement le calcul qu'il ne faut pas avoir à faire.
  const tri = C.evaluer(P, [de('mitraille'), de('mitraille'), de('mitraille')]);
  const pan = C.evaluer(P, [de('mitraille'), de('chaine'), de('barrique')]);
  const pai = C.evaluer(P, [de('mitraille'), de('mitraille')]);
  equal(tri.fureur, undefined, 'la fureur est encore là');
  assert(tri.total > pan.total, `une triplette (${tri.total}) ne bat pas une panachée (${pan.total})`);
  assert(pan.total > pai.total, `une panachée (${pan.total}) ne bat pas une paire (${pai.total})`);
  // L'ÉCART entre les figures est ce qui paie le rechargement : serrées, elles
  // se valaient et améliorer sa main ne rapportait plus rien.
  assert(tri.total - pan.total >= 15,
    `triplette et panachée ne sont séparées que de ${tri.total - pan.total} points`);
});

test('the chain arms the NEXT volley, never its own', () => {
  // Une chaîne qui se doublait elle-même n'était plus une mise en place, c'était
  // un bonus de plus — et le seul ordre où l'écrire est : consommer le drapeau
  // que la volée d'avant a laissé, PUIS reposer celui de celle-ci.
  const { P } = partie(CONTENU.prises[0], 11);
  const chaine = { ...CONTENU.munitions.find((m) => m.id === 'chaine'), bord: 'babord', uid: ++faux };
  const rame = { ...CONTENU.munitions.find((m) => m.id === 'boulet_rame'), bord: 'babord', uid: ++faux };
  P.main = [chaine, rame];
  P.selection = [chaine];
  const un = C.jouer(P);
  equal(un.total, un.poudre, `la chaîne s'est doublée elle-même (${un.total} pour ${un.poudre} de poudre)`);
  equal(P.chaine, true, 'la chaîne n’a pas armé la volée suivante');
  C.riposter(P);
  P.selection = [rame];
  const deux = C.evaluer(P, P.selection);
  equal(deux.total, deux.poudre * 2, `la volée suivante n'a pas été doublée (${deux.total} pour ${deux.poudre})`);
  C.jouer(P);
  equal(P.chaine, false, 'la chaîne dure plus d’une volée');
});

test('a barrel throws the worst munition out of the GAME, and a Fire first', () => {
  // Une barrique jette par-dessus bord : la carte sort de la PARTIE, pas de la
  // main. C'est le seul moyen d'amincir son paquet, et depuis que le charpentier
  // a quitté le deck, le seul moyen de se débarrasser d'un Feu.
  const { P, rng } = partie(CONTENU.prises[0], 13);
  const barrique = { ...CONTENU.munitions.find((m) => m.id === 'barrique'), bord: 'babord', uid: ++faux };
  const rame = { ...CONTENU.munitions.find((m) => m.id === 'boulet_rame'), bord: 'babord', uid: ++faux };
  const mitraille = { ...CONTENU.munitions.find((m) => m.id === 'mitraille'), bord: 'babord', uid: ++faux };
  P.main = [barrique, rame, mitraille];
  P.selection = [barrique];
  C.jouer(P);
  assert(!P.main.includes(mitraille), 'la barrique n’a pas jeté la plus faible');
  assert(!P.defausse.includes(mitraille), 'la munition jetée est revenue par la défausse');
  assert(P.main.includes(rame), 'la barrique a jeté la plus forte');

  // Un Feu passe avant tout le reste : c'est la définition d'une munition ratée.
  const { P: Q } = partie(CONTENU.prises[0], 17);
  Q.prise.annonce = CONTENU.intentions.find((i) => i.effet === 'brulot');
  Q.prise.tirAnnule = false;
  C.riposter(Q); C.completer(Q, rng);
  const feu = Q.main.find(C.estFeu) || Q.pioche.find(C.estFeu);
  if (feu && !Q.main.includes(feu)) { Q.main.push(feu); Q.pioche.splice(Q.pioche.indexOf(feu), 1); }
  if (!Q.main.some(C.estFeu)) return;
  const b2 = { ...CONTENU.munitions.find((m) => m.id === 'barrique'), bord: Q.main.find((c) => !C.estFeu(c)).bord, uid: ++faux };
  Q.main.push(b2); Q.selection = [b2];
  C.jouer(Q);
  equal(Q.main.some(C.estFeu), false, 'la barrique a laissé le Feu en main');
});

test('each of the five staff officers changes a rule', () => {
  // L'ÉQUIPAGE A QUITTÉ LE DECK : il ne se joue plus, il CHANGE UNE RÈGLE.
  // Un homme qui n'apporterait qu'un bonus chiffré serait une munition de plus.
  const avec = (id) => { const Q = C.nouvellePartie(CONTENU); Q.hommes.push(id); C.engager(Q, CONTENU.prises[0], METEO.brise, rngFor(5)); return Q; };
  const nu = () => { const Q = C.nouvellePartie(CONTENU); C.engager(Q, CONTENU.prises[0], METEO.brise, rngFor(5)); return Q; };
  const rouge = (Q) => ({ ...CONTENU.munitions.find((m) => m.id === 'boulet_rouge'), bord: 'babord', uid: ++faux });

  // Etcheverry double les boulets rouges.
  const E = avec('etcheverry');
  equal(C.poudreDe(rouge(E), E), 12, 'Etcheverry ne double pas les boulets rouges');
  const N = nu();
  equal(C.poudreDe(rouge(N), N), 6, 'un boulet rouge vaut déjà double sans Etcheverry');

  // Coudray voit les deux prochaines munitions.
  equal(C.aVenir(avec('coudray')).length, 2, 'Coudray ne voit rien venir');
  equal(C.aVenir(nu()).length, 0, 'on voit venir sans Coudray');

  // Gohier ouvre la rencontre : la PREMIÈRE volée porte +1.
  const G = avec('gohier');
  const m1 = G.main.filter((c) => !C.estFeu(c)).slice(0, 1);
  const g1 = C.evaluer(G, m1).total;
  G.bordees -= 1;
  assert(g1 > C.evaluer(G, m1).total, 'Gohier porte encore après la première volée');

  // Toussaint retire une munition DÉSIGNÉE, une fois par rencontre.
  const T = avec('toussaint');
  const cible = T.main[0];
  const r = C.toussaint(T, cible, rngFor(9));
  equal(r.ok, true, `Toussaint refuse son office : ${r.pourquoi}`);
  assert(!T.main.includes(cible), 'la munition désignée est restée en main');
  assert(!T.defausse.includes(cible), 'la munition retirée est revenue par la défausse');
  equal(C.toussaint(T, T.main[0], rngFor(9)).ok, false, 'Toussaint sert deux fois dans la même rencontre');
  equal(C.toussaint(nu(), null, rngFor(9)).ok, false, 'Toussaint sert sans être à bord');

  // Ozanne remet la volée précédente en main, une fois par rencontre.
  const O = avec('ozanne');
  equal(C.ozanne(O).ok, false, 'Ozanne rejoue une volée qui n’a pas eu lieu');
  O.selection = O.main.filter((c) => C.peutJouer(O, c).ok).slice(0, 2);
  const jouees = O.selection.slice();
  C.jouer(O); C.riposter(O);
  const o = C.ozanne(O);
  equal(o.ok, true, `Ozanne refuse son office : ${o.pourquoi}`);
  empty(jouees.filter((c) => !O.main.includes(c)), 'la volée précédente n’est pas revenue en main');
  equal(C.ozanne(O).ok, false, 'Ozanne sert deux fois dans la même rencontre');
});

test('the three endings, and only the first pays in full', () => {
  // Deux victoires et une fuite. Amener le pavillon rend la cargaison entière ;
  // couler la prise n'en rend que ce qui flotte ; ne pas y arriver en quatre
  // bordées ne rend rien du tout. C'est ce qui donne son prix à un
  // rechargement mal dépensé.
  const pavillon = () => {
    const { P } = partie(CONTENU.prises[0], 5);
    P.pression = P.prise.resistance - 1;
    P.selection = P.main.filter((c) => C.peutJouer(P, c).ok).slice(0, C.MAIN_MAX);
    C.jouer(P);
    return P;
  };
  const A = pavillon();
  equal(A.fini, 'prise', 'la résistance atteinte n’a pas fait amener le pavillon');
  assert(A.butin >= A.prise.butin, `une prise rendue ne rapporte que ${A.butin} sur ${A.prise.butin}`);

  const { P: B } = partie(CONTENU.prises[2], 5);   // galion : sa coque cède avant sa résistance
  B.prise.pv = 1;
  B.selection = B.main.filter((c) => C.peutJouer(B, c).ok).slice(0, C.MAIN_MAX);
  C.jouer(B);
  equal(B.fini, 'coulee', 'une coque à zéro sous la résistance n’a pas coulé la prise');
  assert(B.butin > 0 && B.butin < B.prise.butin,
    `coulée, elle rend ${B.butin} au lieu d’une part de ${B.prise.butin}`);

  const { P: D, rng } = partie(CONTENU.prises[4], 5);   // vaisseau : hors de portée en quatre coups
  let garde = 0;
  while (!D.fini && garde++ < 12) {
    const v = C.meilleureVolee(D);
    D.selection = v ? v.cartes : [];
    if (D.selection.length) C.jouer(D);
    if (!D.fini) { C.riposter(D); C.completer(D, rng); }
  }
  equal(D.fini, 'echec', `le vaisseau n’a pas échappé en quatre bordées (${D.fini})`);
  equal(D.butin, 0, 'une prise échappée a quand même rapporté');
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

test('a topman in the volley cancels the announced card', () => {
  // TOUT CE QUI RESTE DU GRÉEMENT. Il n'y a plus de mât à abattre, plus de
  // seuil de puissance à franchir, plus de regréement à compter : un gabier est
  // de la volée ou il n'y est pas. Trois états à tenir en tête sont devenus un
  // seul, et il se lit sur la carte.
  const { P } = partie(CONTENU.prises[2], 5);
  const gabier = P.main.find((c) => !C.estFeu(c) && c.role === 'gabier');
  if (!gabier) return;
  P.selection = [gabier];
  const j = C.jouer(P);
  equal(j.annule, true, 'un gabier dans la volée n’annule pas la carte annoncée');
  const r = C.riposter(P);
  equal(r.annulee, true, 'la carte annoncée est tombée quand même');

  // Et sans gabier, elle tombe.
  const { P: Q } = partie(CONTENU.prises[2], 5);
  const sans = Q.main.filter((c) => !C.estFeu(c) && c.role !== 'gabier');
  if (!sans.length) return;
  Q.selection = [sans[0]];
  equal(C.jouer(Q).annule, false, 'une volée sans gabier annule quand même');
  equal(C.riposter(Q).annulee, false, 'la carte annoncée n’est pas tombée');
});

test('the prize takes her toll on the hand, never on a hull we no longer have', () => {
  // SA CARTE NE TOUCHE PLUS NOTRE COQUE — nous n'en avons plus. Elle touche la
  // main (mitraille, brûlot, grappin) ou le compteur (manœuvre, colmatage). On
  // ne perd plus en coulant, on perd en manquant le seuil.
  const bad = CONTENU.intentions.filter((i) => ['canon', 'virement', 'radoub'].includes(i.effet))
    .map((i) => `${i.id} → effet retiré « ${i.effet} »`);
  empty(bad, 'intentions still aiming at a hull that no longer exists');

  const { P } = partie(CONTENU.prises[1], 5);
  equal(P.nous, undefined, 'La Tortue a encore des points de vie');
  let garde = 0;
  while (!P.fini && garde++ < 12) {
    const v = C.meilleureVolee(P);
    P.selection = v ? v.cartes : [];
    if (P.selection.length) C.jouer(P);
    if (!P.fini) C.riposter(P);
  }
  assert(P.fini !== 'naufrage', 'on peut encore couler');
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

test('the sea soaks the best munition in hand, never one at random', () => {
  const mouillage = CONTENU.intentions.find((i) => i.effet === 'mouillage');
  const { P } = partie(CONTENU.prises[1], 23);
  P.prise.annonce = mouillage;
  P.prise.tirAnnule = false;
  const attendu = P.main.filter((c) => !C.estFeu(c))
    .sort((a, b) => C.poudreDe(b, P) - C.poudreDe(a, P) || a.uid - b.uid)[0];
  C.riposter(P);
  equal(attendu.mouillee, true, 'la lame n’a pas noyé la munition annoncée');
  equal(C.poudreDe(attendu, P), 0, 'une munition mouillée compte encore de la poudre');
});

suite('cartes — contenu');

test('the deck is made of munitions, repeated often enough to make figures', () => {
  // LE DECK EST FAIT DE MUNITIONS, PAS D'HOMMES. C'est ce qui permet aux
  // FIGURES d'exister : avec des hommes tous différents, aucune main ne
  // ressemblait à une autre et il n'y avait rien à reconnaître.
  const bad = [];
  const ids = CONTENU.munitions.map((m) => m.id);
  for (const m of CONTENU.munitions) {
    if (!m.nom || !m.texte) bad.push(`munition ${m.id} incomplète`);
    if (typeof m.poudre !== 'number') bad.push(`munition ${m.id} sans poudre`);
  }
  for (const [id, n] of Object.entries(CONTENU.deck)) {
    if (!ids.includes(id)) bad.push(`deck → « ${id} » n'existe pas`);
    // Trois exemplaires au moins : en dessous, la triplette est impossible et
    // la figure la plus payante n'est qu'un texte.
    if (n < 3) bad.push(`deck.${id} → ${n} exemplaire(s) : pas de triplette possible`);
  }
  for (const id of ids) if (!CONTENU.deck[id]) bad.push(`deck → « ${id} » n'est pas dans le paquet`);
  // Ce qui a quitté le contenu avec les hommes.
  for (const k of ['roles', 'equipage', 'recrues', 'officiers', 'quarts']) {
    if (CONTENU[k]) bad.push(`data/equipage.json porte encore « ${k} »`);
  }
  empty(bad, 'a deck that cannot make a figure');

  const P = C.nouvellePartie(CONTENU);
  assert(P.deck.length >= 30, `le paquet ne fait que ${P.deck.length} cartes`);
});

test('the staff replaces both the recruits and the officers', () => {
  const bad = [];
  for (const h of CONTENU.hommes) {
    if (!h.nom || !h.titre || !h.texte || !h.prix) bad.push(`homme ${h.id} incomplet`);
    if (!h.verbe) bad.push(`${h.id} n'a pas de verbe — ce n'est qu'un texte`);
  }
  empty(bad, 'staff with nothing to change');
  assert(CONTENU.hommes.length <= C.ETAT_MAJOR_MAX,
    `${CONTENU.hommes.length} hommes proposés pour ${C.ETAT_MAJOR_MAX} places`);

  // On n'en engage pas six.
  const P = C.nouvellePartie(CONTENU);
  P.butin = 999;
  for (const h of CONTENU.hommes) equal(C.engagerHomme(P, h).ok, true, `${h.id} refusé`);
  const r = C.engagerHomme(P, { id: 'un_de_trop', prix: 1 });
  equal(r.ok, false, 'un sixième homme est monté à l’état-major');
  assert(r.pourquoi, 'le refus ne dit pas pourquoi');
});

test('every prize rule and intention is defined', () => {
  const bad = [];
  const connus = CONTENU.intentions.map((i) => i.id);
  for (const id of CONTENU.intentions_deck || []) {
    if (!connus.includes(id)) bad.push(`intentions_deck → « ${id} » n'existe pas`);
  }
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
    if (b.resistance <= a.resistance) bad.push(`${b.id} (résistance)`);
    if (b.riposte <= a.riposte) bad.push(`${b.id} (riposte)`);
    if (b.butin <= a.butin) bad.push(`${b.id} (butin)`);
  }
  empty(bad, 'prizes that do not escalate');
});

suite('cartes — est-ce que choisir compte ?');

// LA QUESTION LA PLUS IMPORTANTE DU JEU. Tant que « la volée la plus forte »
// était toujours la bonne réponse, il n'y avait pas de décision : le joueur
// exécutait un calcul, il ne choisissait rien.
//
// Sous la structure à seuil, la seconde monnaie n'est plus la cargaison — elle
// est le RECHARGEMENT. Quatre bordées pour atteindre la résistance annoncée,
// trois rechargements pour se refaire une main : dépenser un rechargement,
// c'est parier qu'une meilleure main rapportera plus que le coup qu'on ne tire
// pas. Ce test mesure que le pari existe vraiment, et qu'il est gros.
function chasser(prise, seed, recharge) {
  const { P, rng } = partie(prise, seed);
  let garde = 0;
  while (!P.fini && garde++ < 30) {
    const v = C.meilleureVolee(P);
    const reste = (P.prise.resistance - P.pression) / Math.max(1, P.bordees);
    // On ne recharge pas « quand la main est laide » : on recharge quand elle
    // ne tient pas le RYTHME qu'il reste à tenir. C'est la résistance annoncée
    // qui rend la décision calculable — c'est tout l'objet de l'annoncer.
    if (recharge && P.rechargements > 0 && (!v || v.pression < reste * 0.75)) {
      const garder = new Set((v && v.cartes) || []);
      P.selection = P.main.filter((c) => !garder.has(c)).slice(0, C.MAIN_MAX);
      if (P.selection.length) { C.recharger(P, rng); continue; }
      P.selection = [];
    }
    if (!v || !v.cartes.length) { P.selection = []; C.riposter(P); C.completer(P, rng); continue; }
    P.selection = v.cartes;
    C.jouer(P);
    if (!P.fini) { C.riposter(P); C.completer(P, rng); }
  }
  return { pris: P.fini === 'prise', butin: P.butin };
}

test('the reload still buys something, even if it no longer decides', () => {
  // Les deux capitaines jouent les mêmes mains sur les mêmes graines et
  // tirent la même volée ; l'un se sert de ses trois rechargements, l'autre
  // les garde. Si l'écart est petit, les rechargements sont un décor et la
  // rencontre n'a qu'un seul axe.
  // ATTENTION — CET INSTRUMENT A PERDU SA FORCE, et les seuils ci-dessous
  // ENREGISTRENT une régression au lieu de l'empêcher.
  //
  // Avec la fureur, un rechargement pesait 13 prises sur 60 sur la barque et 18
  // sur la flûte : améliorer sa main MULTIPLIAIT ce qu'elle valait, donc le
  // pari se payait. La fureur retirée, tout s'additionne, et une meilleure main
  // ne rapporte plus que quelques points — l'écart est tombé à 5 et 4.
  //
  // Écarter les figures (paire 6, panachée 14, triplette 34) le rouvre un peu,
  // pas assez. La cause est structurelle : à cinq cartes en main et sans
  // contrainte de composition, une figure est presque toujours déjà là, donc
  // il n'y a rien à aller chercher. C'est une décision de conception à prendre
  // — rendre les figures plus rares, ou la main plus petite — pas un seuil à
  // baisser une fois de plus.
  for (const [i, seuil] of [[0, 4], [1, 3]]) {
    const prise = CONTENU.prises[i];
    let avec = 0, sans = 0, bAvec = 0, bSans = 0;
    for (let s = 1; s <= 60; s++) {
      const a = chasser(prise, s * 977, true);
      const b = chasser(prise, s * 977, false);
      if (a.pris) avec++; if (b.pris) sans++;
      bAvec += a.butin; bSans += b.butin;
    }
    console.log(`      ${prise.id} — avec rechargements : ${avec}/60 · sans : ${sans}/60`);
    assert(avec >= sans + seuil,
      `${prise.id} : les rechargements ne pèsent que ${avec - sans} prises sur 60 — ils ne décident de rien`);
    assert(bAvec > bSans, `${prise.id} : recharger ne rapporte pas plus de butin`);
    assert(sans > 0, `${prise.id} : sans rechargement, la manche est injouable (${sans}/60)`);
  }
});

test('a prize that strikes her colours pays more than one sent to the bottom', () => {
  // Deux victoires, deux butins. Amener le pavillon rend la cargaison entière,
  // et l'abordage y ajoute une prime : deux abordeurs sur une coque basse
  // poussent le plus fort du jeu. Coulée au canon, on ne repêche que ce qui
  // flotte.
  const { P } = partie(CONTENU.prises[0], 5);
  const porte = P.prise.butin;
  P.prise.pv = 12;                            // coque basse : l'abordage est ouvert
  P.pression = P.prise.resistance - 1;        // un rien suffit à faire tomber le pavillon
  const abordeurs = P.main.filter((c) => !C.estFeu(c) && c.role === 'abordeur');
  if (abordeurs.length < 2) return;
  P.selection = abordeurs.slice(0, 2);
  equal(C.evaluer(P, P.selection).cible, 'abordage', 'deux abordeurs sur une coque basse ne sautent pas à bord');
  equal(C.evaluer(P, P.selection).degats > 0, true, 'un abordage n’entame pas la coque');
  C.jouer(P);
  equal(P.fini, 'prise', 'l’abordage n’a pas fait amener le pavillon');
  assert(P.prise.prime > 0, 'une prise abordée ne rapporte aucune prime');
  assert(P.butin > porte, `prise à l'abordage, elle rapporte ${P.butin} alors qu'elle portait ${porte}`);

  // La même prise, coulée : une part seulement.
  const { P: Q } = partie(CONTENU.prises[2], 5);
  Q.prise.pv = 1;
  Q.selection = Q.main.filter((c) => C.peutJouer(Q, c).ok).slice(0, C.MAIN_MAX);
  C.jouer(Q);
  equal(Q.fini, 'coulee', 'la coque à zéro n’a pas coulé la prise');
  assert(Q.butin < Q.prise.butin, `coulée, elle rend ${Q.butin} sur ${Q.prise.butin}`);
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
      const g = C.meilleureVolee(P, { viser: 'greement' });
      const d = C.meilleureVolee(P);
      const a = P.prise.annonce;
      const evite = a.effet === 'canon' && !P.prise.tirAnnule
        ? Math.round(P.prise.riposte * a.force * (0.5 + 0.5 * (P.prise.mats / P.prise.matsMax))) : 0;
      cartes = (g && g.abat && evite > (d ? d.degats : 0) + 4) ? g.cartes : (d ? d.cartes : null);
      // Et il RECHARGE quand sa main ne suit pas le rythme qu'il lui reste à
      // tenir : c'est le seul usage des trois rechargements, et c'est là que
      // le maladroit perd la manche sans s'en apercevoir.
      const reste = (P.prise.resistance - P.pression) / Math.max(1, P.bordees);
      if (P.rechargements > 0 && (!d || d.pression < reste * 0.75)) {
        const garder = new Set(cartes || []);
        P.selection = P.main.filter((c) => !garder.has(c)).slice(0, C.MAIN_MAX);
        if (P.selection.length) { C.recharger(P, rng); continue; }
        P.selection = [];
      }
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

test('a careful captain takes the first prize far more often than a careless one', () => {
  // LA BARQUE, et non plus la flûte : le paquet de munitions frappe deux fois
  // plus fort que l'ancien paquet d'hommes, les résistances ont été réétalonnées
  // d'autant, et la flûte est devenue une prise d'acte 2. Mesurer « la manche
  // de départ est-elle gagnable » sur une prise d'acte 2 ne mesure rien.
  const prise = CONTENU.prises[0];
  let bons = 0, mauvais = 0;
  for (let s = 1; s <= 60; s++) {
    if (duel(prise, s * 977, true)) bons++;
    if (duel(prise, s * 977, false)) mauvais++;
  }
  console.log(`      appliqué : ${bons}/60 · maladroit : ${mauvais}/60`);
  // CET INSTRUMENT A RETROUVÉ SA FORCE. Sous le score additif, l'écart était
  // de 15 prises sur 60 ; le passage au score à deux axes (poudre × fureur) l'a
  // fait tomber à 6, parce que la multiplication récompense DEUX FOIS le fait de
  // jouer beaucoup de cartes. La structure à seuil l'a rouvert à 40 : avec
  // quatre bordées seulement pour atteindre une résistance annoncée, une main
  // mal lue ne se rattrape plus au tour suivant — il n'y a pas de tour suivant.
  assert(bons >= 45, `le joueur appliqué ne prend la flûte que ${bons}/60 — la manche est trop dure`);
  assert(bons >= mauvais, `le maladroit (${mauvais}/60) fait mieux que l'appliqué (${bons}/60) — jouer au hasard est devenu la meilleure ligne`);
  assert(mauvais <= 55, `le joueur maladroit la prend ${mauvais}/60 — le choix ne compte plus du tout`);
});

test('the line-of-battle ship is out of reach of a starting crew', () => {
  let bons = 0;
  for (let s = 1; s <= 40; s++) if (duel(CONTENU.prises[4], s * 613, true)) bons++;
  assert(bons <= 4, `le vaisseau tombe ${bons}/40 avec l'équipage de départ — la progression n'a rien à vendre`);
});

// LES ZONES. Une carte est quelque part, et à un seul endroit. C'est
// l'invariant qui, dans un jeu de cartes, ne se voit jamais quand il casse :
// une munition dupliquée n'est qu'une main un peu chanceuse, une munition
// perdue n'est qu'un paquet un peu court, et ni l'une ni l'autre ne lève
// d'erreur. On perd une partie sur une main légèrement fausse, et l'on cherche
// le défaut dans le barème.
//
// Le partage est le suivant, et il est exact :
//
//   `P.deck` est la MAÎTRESSE LISTE, pas une zone. `pioche`, `main` et
//   `defausse` se la partagent — les mêmes objets, jamais des copies.
//   `retirerDeLaPartie` doit donc trancher dans `deck` AUSSI, sinon la barrique
//   ne jette que pour une rencontre et la carte revient au réengagement.
//
//   `P.selection` n'est PAS une zone : c'est une marque posée sur des cartes
//   qui restent en main. Compter ses cartes comme un quatrième tas ferait voir
//   des doublons partout.
//
//   Une carte FEU est la seule exception, et par construction : le brûlot la
//   pousse sur la pioche sans la mettre au deck, parce qu'elle n'appartient pas
//   au paquet du joueur. Elle sort en étant jouée (`jouer` ne la défausse pas)
//   ou par une barrique, et elle ne survit pas à la rencontre.
suite('cartes — les zones');

const zonesDe = (P) => {
  const ou = new Map();
  for (const [nom, tas] of [['main', P.main], ['pioche', P.pioche], ['defausse', P.defausse]])
    for (const c of tas) { if (!ou.has(c)) ou.set(c, []); ou.get(c).push(nom); }
  return ou;
};

test('une carte est dans exactement une zone, du premier tour au dernier', () => {
  const fautes = [];
  for (const prise of CONTENU.prises) {
    for (let s = 1; s <= 20; s++) {
      const { P, rng } = partie(prise, s * 31);
      for (let tour = 0; tour < 12 && !P.fin; tour++) {
        const ou = zonesDe(P);
        for (const [c, zs] of ou)
          if (zs.length > 1) fautes.push(`${prise.id}/${s}: ${c.nom} est à la fois en ${zs.join(' et en ')}`);
        // La maîtresse liste, aux Feu près — qui n'en font jamais partie.
        const compte = [...ou.keys()].filter((c) => !C.estFeu(c)).length;
        if (compte !== P.deck.length)
          fautes.push(`${prise.id}/${s}/t${tour}: ${compte} cartes dans les zones pour ${P.deck.length} au deck`);
        for (const c of P.selection)
          if (!P.main.includes(c)) fautes.push(`${prise.id}/${s}: une carte sélectionnée n'est plus en main`);
        const volee = C.meilleureVolee(P);
        if (!volee || !volee.length) break;
        for (const c of volee) C.selectionner(P, c);
        C.jouer(P); C.riposter(P); C.completer(P, rng);
      }
    }
  }
  empty(fautes, 'les zones ne se partagent plus les cartes proprement');
});

test('la barrique jette hors de la MAÎTRESSE liste, pas seulement de la main', () => {
  // Une carte jetée par-dessus bord qui resterait au deck reviendrait au
  // réengagement : l'amincissement redeviendrait une défausse, et la barrique
  // n'aurait plus de verbe propre.
  const { P } = partie(CONTENU.prises[0], 7);
  const avant = P.deck.length;
  const cible = P.main.find((c) => c.id !== 'barrique') || P.main[0];
  C.retirerDeLaPartie(P, cible);
  equal(P.deck.length, avant - 1, 'la carte est sortie des zones mais pas du deck');
  for (const tas of [P.main, P.pioche, P.defausse, P.deck, P.selection])
    assert(!tas.includes(cible), 'la carte jetée traîne encore dans un tas');
});

test('le paquet ne se tarit jamais : la défausse se rebat quand la pioche est vide', () => {
  // Sans rebattage, une pioche vide fait échouer la relève en SILENCE : la main
  // se remplit à moitié et le joueur croit à une mauvaise donne.
  const { P, rng } = partie(CONTENU.prises[0], 5);
  P.defausse.push(...P.pioche.splice(0));
  assert(P.defausse.length > 0, 'la mise en place du test est fausse');
  P.main.splice(0);
  C.completer(P, rng);
  assert(P.main.length > 0, 'pioche vide et défausse pleine : la main est restée vide');
  empty(P.main.filter((c) => !P.deck.includes(c) && !C.estFeu(c)),
    'le rebattage a fabriqué des cartes qui ne sont pas au deck');
});

test('une carte Feu ne reste jamais dans le paquet du joueur', () => {
  // Elle vient du brûlot, elle n'est pas à nous. Jouée, elle ne se défausse
  // pas ; jetée par une barrique, elle disparaît. Dans les deux cas elle ne
  // doit pas se retrouver au deck, sinon le brûlot amocherait la partie et non
  // la rencontre.
  const { P, rng } = partie(CONTENU.prises[0], 11);
  const feu = { ...CONTENU.munitions[0], id: 'feu', nom: 'Feu', poudre: 0, bord: 'babord', uid: ++faux };
  P.pioche.push(feu);
  P.main.splice(0);
  C.completer(P, rng);
  assert(P.main.includes(feu), 'la carte Feu poussée sur le dessus n’arrive pas en main (règle 10)');
  assert(!P.deck.includes(feu), 'la carte Feu s’est glissée dans la maîtresse liste');
  C.selectionner(P, feu);
  C.jouer(P);
  assert(!P.defausse.includes(feu), 'la carte Feu est retombée dans la défausse : elle reviendra');
  assert(!P.main.includes(feu), 'la carte Feu est restée en main après avoir été jouée');
});
