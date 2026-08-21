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
  const avantPv = P.nous.pv, avantTour = P.tour, avantBordees = P.bordees;
  P.selection = P.main.slice(0, 3);
  const renvoyes = P.selection.slice();
  const ok = C.recharger(P, rng);
  assert(ok.ok, `le rechargement a été refusé : ${ok.pourquoi}`);
  equal(P.rechargements, C.RECHARGEMENTS - 1, 'le rechargement n’a rien coûté');
  equal(P.bordees, avantBordees, 'un rechargement a mangé une bordée');
  equal(P.nous.pv, avantPv, 'la prise a riposté à un rechargement');
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

test('the quartermaster and the false bottom buy shots, not nothing', () => {
  // Ces deux-là achetaient un homme de relève. La relève supprimée, ils
  // seraient devenus deux textes sans verbe — un objet qui ne change aucune
  // règle n'est qu'un homme de plus. Ils achètent maintenant des COUPS, la
  // seule ressource de la rencontre.
  const { P } = partie(CONTENU.prises[0], 3);
  equal(P.bordees, C.BORDEES, 'la rencontre nue ne part pas à quatre bordées');
  equal(P.rechargements, C.RECHARGEMENTS, 'la rencontre nue ne part pas à trois rechargements');

  const Q = C.nouvellePartie(CONTENU);
  Q.officiers.push('quartier_maitre');
  Q.reliques.push('double_fond');
  C.engager(Q, CONTENU.prises[0], METEO.brise, rngFor(3));
  equal(Q.bordees, C.BORDEES + 1, 'le double fond n’ajoute pas de bordée');
  equal(Q.rechargements, C.RECHARGEMENTS + 1, 'le quartier-maître n’ajoute pas de rechargement');
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

test('the reload is the real second currency — spending it decides the flute', () => {
  // Les deux capitaines jouent les mêmes mains sur les mêmes graines et
  // tirent la même volée ; l'un se sert de ses trois rechargements, l'autre
  // les garde. Si l'écart est petit, les rechargements sont un décor et la
  // rencontre n'a qu'un seul axe.
  for (const [i, seuil] of [[0, 3], [1, 20]]) {
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

test('a careful captain takes the merchantman far more often than a careless one', () => {
  const prise = CONTENU.prises[1];
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
