// LA VOLÉE NUE — le plateau simplifié. Deux natures de tests :
//
//  - les invariants : onze cartes et pas une de plus, aucun dé dans la
//    résolution, un refus motivé plutôt qu'un silence ;
//  - et la seule question qui décide si ce plateau vaut quelque chose : quand
//    on a retiré la fureur, les effets de carte, la riposte et le rechargement,
//    reste-t-il un CHOIX ? Les mêmes graines, les mêmes mains, jouées par un
//    capitaine qui lit sa main et par un capitaine qui pose les trois premières
//    cartes venues. Si l'écart se referme, il ne reste plus rien à jouer et le
//    plateau est à jeter — pas le test à assouplir.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import * as S from '../src/simple.js';

const CONTENU = JSON.parse(readFileSync(new URL('../data/simple.json', import.meta.url), 'utf8'));

const rngFor = (seed) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};
const partie = (prise, seed) => {
  const P = S.nouvellePartie(CONTENU);
  const rng = rngFor(seed);
  S.engager(P, prise, rng);
  return { P, rng };
};
const PRISE = CONTENU.prises[0];
const SANS_FIN = { id: 'essai', nom: 'Cible d’essai', resistance: 99999, butin: 0 };

// Une carte de test, montée à la main depuis le contenu : les `uid` du jeu sont
// distribués par le module, ceux-ci n'ont qu'à être distincts entre eux.
let faux = 9000;
const c = (id) => ({ ...CONTENU.cartes.find((x) => x.id === id), uid: ++faux });

suite('simple — invariants');

test('les règles ne touchent jamais un dé', () => {
  // Y COMPRIS DANS UN COMMENTAIRE : le jour où quelqu'un met un tirage en
  // commentaire, c'est qu'il pense à en mettre un dans le code.
  const code = readFileSync(new URL('../src/simple.js', import.meta.url), 'utf8');
  const bad = [];
  for (const interdit of ['Math.random', 'Date.now', 'crypto']) {
    if (code.includes(interdit)) bad.push(`src/simple.js contient ${interdit}`);
  }
  empty(bad, 'la résolution doit être déterministe');
});

test('le paquet fait onze cartes : 2×3 communes, 2×2 peu communes, 1 rare', () => {
  // ONZE, ET C'EST LA RÈGLE ENTIÈRE. Un paquet qu'on compte sur les doigts :
  // au troisième tour, un joueur SAIT ce qui reste parce qu'il l'a vu passer.
  const deck = S.monterLeDeck(CONTENU);
  equal(deck.length, 11, 'onze cartes au paquet');
  const parRarete = {};
  const types = {};
  for (const x of deck) {
    types[x.id] = (types[x.id] || 0) + 1;
    parRarete[x.rarete] = (parRarete[x.rarete] || 0) + 1;
  }
  equal(Object.keys(types).length, 5, 'cinq types, pas un de plus');
  equal(parRarete.commune, 6, 'six communes — deux types à trois exemplaires');
  equal(parRarete.peu_commune, 4, 'quatre peu communes — deux types à deux');
  equal(parRarete.rare, 1, 'une rare, et une seule');
});

test('LA RARETÉ EST UNE FRÉQUENCE, PAS UN POUVOIR', () => {
  // Elle ne dit que le nombre d'exemplaires. Le jour où une rareté accorde en
  // plus un bonus, elle devient une seconde chose à lire sur chaque carte — et
  // c'est précisément ce que ce plateau a été monté pour ne pas avoir.
  //
  // Sa conséquence tient en une ligne, et c'est tout l'équilibre du paquet :
  // seules les COMMUNES peuvent former une triplette, puisqu'elles seules
  // existent en trois exemplaires ; la RARE ne s'assortit avec rien, et ne vaut
  // donc jamais que sa poudre.
  const bad = [];
  const attendu = Object.fromEntries(CONTENU.raretes.map((r) => [r.id, r.exemplaires]));
  for (const x of CONTENU.cartes) {
    if (!(x.rarete in attendu)) { bad.push(`${x.id} porte une rareté inconnue : ${x.rarete}`); continue; }
    if (CONTENU.deck[x.id] !== attendu[x.rarete])
      bad.push(`${x.id} est ${x.rarete} mais tirée à ${CONTENU.deck[x.id]} au lieu de ${attendu[x.rarete]}`);
  }
  empty(bad, 'la rareté doit dire le nombre d’exemplaires, et rien d’autre');
  equal(attendu.rare, 1, 'une rare est unique — sans quoi elle pourrait faire une paire');
});

test('une triplette de la plus faible bat la rare toute seule', () => {
  // C'EST LE PLATEAU EN UNE LIGNE. Si la carte la plus chère gagnait toujours,
  // il n'y aurait rien à assortir et la main ne dirait rien.
  const P = S.nouvellePartie(CONTENU);
  const faible = CONTENU.cartes.filter((x) => x.rarete === 'commune')
    .sort((a, b) => a.poudre - b.poudre)[0];
  const rare = CONTENU.cartes.find((x) => x.rarete === 'rare');
  const triplette = S.evaluer(P, [c(faible.id), c(faible.id), c(faible.id)]).total;
  const seule = S.evaluer(P, [c(rare.id)]).total;
  assert(triplette > seule,
    `une triplette de ${faible.nom} rend ${triplette} contre ${seule} pour ${rare.nom} seule — la carte chère gagne toujours`);
});

test('une carte n’a qu’un nom, une poudre et une rareté', () => {
  // C'EST LA PROMESSE DU PLATEAU. Le jour où une carte porte un effet, un bord
  // ou un niveau, il y a une seconde chose à lire avant de décider, et tout le
  // reste de la simplification ne sert plus à rien.
  const bad = [];
  const permis = new Set(['id', 'nom', 'poudre', 'texte', 'rarete']);
  for (const x of CONTENU.cartes) {
    for (const k of Object.keys(x)) if (!permis.has(k)) bad.push(`${x.id} porte « ${k} »`);
    if (typeof x.poudre !== 'number') bad.push(`${x.id} n’a pas de poudre`);
  }
  empty(bad, 'une carte ne porte que son type, sa poudre et sa rareté');
});

test('chaque prise annonce sa résistance, et l’échelle monte', () => {
  const bad = [];
  let precedent = 0;
  for (const p of CONTENU.prises) {
    if (!(p.resistance > 0)) bad.push(`${p.id} sans résistance`);
    if (p.resistance <= precedent) bad.push(`${p.id} ne monte pas sur ${precedent}`);
    if (!(p.butin > 0)) bad.push(`${p.id} sans butin`);
    precedent = p.resistance;
  }
  empty(bad, 'les cinq prises forment une échelle');
});

test('un ordre impossible se refuse à voix haute', () => {
  const { P } = partie(PRISE, 21);
  for (const x of P.main.slice(0, S.VOLEE_MAX)) S.selectionner(P, x);
  const r = S.selectionner(P, P.main[S.VOLEE_MAX]);
  assert(!r.ok, 'une quatrième carte doit être refusée');
  assert(typeof r.pourquoi === 'string' && r.pourquoi.length, 'et le refus doit se dire');
  const hors = S.selectionner(P, c('mitraille'));
  assert(!hors.ok && hors.pourquoi, 'une carte hors de la main aussi');
});

test('la même volée jouée deux fois donne deux fois le même chiffre', () => {
  const { P } = partie(SANS_FIN, 404);
  const volee = P.main.slice(0, 3);
  equal(S.evaluer(P, volee).total, S.evaluer(P, volee).total, 'aucune entropie dans le compte');
});

suite('simple — la puissance vient du type et de la main, et de rien d’autre');

test('les figures : la paire et la triplette, et il n’y en a pas de troisième', () => {
  const P = S.nouvellePartie(CONTENU);
  const rame = () => c('boulet_rame');     // 6
  const mit = () => c('mitraille');        // 4
  const rouge = () => c('boulet_rouge');   // 10

  equal(S.figureDe([rame()]), null, 'une carte seule n’est pas une figure');
  equal(S.figureDe([rame(), mit()]), null, 'deux types différents non plus');
  equal(S.figureDe([rame(), rame()]), 'paire', 'deux du même type : une paire');
  equal(S.figureDe([rame(), rame(), rame()]), 'triplette', 'trois du même type : une triplette');
  // TROIS TYPES TOUS DIFFÉRENTS N'EST PAS UNE FIGURE. La « panachée » existe
  // dans l'autre plateau ; ici elle demanderait de vérifier une seconde
  // condition, en sens inverse de la première.
  equal(S.figureDe([rame(), mit(), rouge()]), null, 'trois types différents ne valent aucune figure');

  // TOUT S'ADDITIONNE, et rien ne multiplie : c'est la raison d'être du plateau.
  equal(S.evaluer(P, [rame(), mit(), rouge()]).total, 20, '6 + 4 + 10, sans figure');
  equal(S.evaluer(P, [rame(), rame()]).total, 20, '6 + 6 + 8 de paire');
  equal(S.evaluer(P, [mit(), mit(), mit()]).total, 36, '4 × 3 + 24 de triplette');
  equal(S.evaluer(P, [rouge(), rouge(), rouge()]).total, 54, 'la plus forte volée du jeu');
});

test('une triplette de la plus faible bat un boulet rouge seul', () => {
  // C'EST TOUT LE JEU EN UNE LIGNE. Si la carte la plus chère gagnait toujours,
  // il n'y aurait rien à assortir et la main ne dirait rien.
  const P = S.nouvellePartie(CONTENU);
  const triple = S.evaluer(P, [c('mitraille'), c('mitraille'), c('mitraille')]).total;
  const seul = S.evaluer(P, [c('boulet_rouge')]).total;
  assert(triple > seul * 3, `la triplette de mitraille (${triple}) doit écraser le rouge seul (${seul})`);
});

test('chaque ligne du compte dit d’où elle vient', () => {
  // L'écran joue le score EN SÉQUENCE : sans cette provenance, il devrait
  // deviner en relisant les noms — et un nom est du contenu qui change.
  const P = S.nouvellePartie(CONTENU);
  const cartes = [c('boulet_rame'), c('boulet_rame')];
  const r = S.evaluer(P, cartes);
  equal(r.lignes.length, 3, 'deux cartes et une figure');
  equal(r.lignes[0].source, 'carte');
  equal(r.lignes[0].uid, cartes[0].uid, 'la ligne désigne SA carte');
  equal(r.lignes[2].source, 'figure');
  equal(r.lignes[2].id, 'paire');
});

suite('simple — les deux fins');

test('la résistance atteinte rend le butin plein, la dernière bordée ne rend rien', () => {
  const { P, rng } = partie({ ...PRISE, resistance: 1 }, 7);
  S.selectionner(P, P.main[0]);
  S.jouer(P);
  equal(P.fini, 'prise', 'le seuil atteint clôt la rencontre');
  equal(P.prise.gagne, PRISE.butin, 'butin plein');
  equal(P.butin, PRISE.butin);

  const dur = partie({ ...PRISE, resistance: 99999 }, 7);
  for (let i = 0; i < S.BORDEES && !dur.P.fini; i++) {
    S.selectionner(dur.P, dur.P.main[0]);
    S.jouer(dur.P);
    S.completer(dur.P, dur.rng);
  }
  equal(dur.P.fini, 'echec', 'plus une bordée : elle s’échappe');
  equal(dur.P.prise.gagne, 0, 'et l’on n’a rien');
  // IL N'Y A PAS DE TROISIÈME FIN. La coulée a disparu avec la coque.
  assert(['prise', 'echec'].includes(dur.P.fini));
});

test('le seuil atteint du dernier coup est une prise, pas une évasion', () => {
  const { P } = partie({ ...PRISE, resistance: 1 }, 11);
  P.bordees = 1;
  S.selectionner(P, P.main[0]);
  S.jouer(P);
  equal(P.fini, 'prise', 'la résistance passe avant la bordée dépensée');
});

test('la main se remplit à ras, et le paquet se rebat sur onze cartes', () => {
  const { P, rng } = partie(SANS_FIN, 33);
  equal(P.main.length, S.MAIN, 'cinq cartes en main à l’engagement');
  equal(P.main.length + P.pioche.length, 11, 'onze cartes en jeu, et pas une de plus');
  for (let tour = 0; tour < 6; tour++) {
    for (const x of P.main.slice(0, 3)) S.selectionner(P, x);
    S.jouer(P);
    S.completer(P, rng);
    equal(P.main.length + P.pioche.length + P.defausse.length, 11, 'aucune carte ne se perd ni ne se duplique');
    equal(P.main.length, S.MAIN, 'la main revient à ras, même après rebattage');
    P.bordees = S.BORDEES; P.fini = null;   // on prolonge exprès, pour voir tourner le paquet
  }
});

suite('simple — est-ce que choisir compte ?');

test('le capitaine qui lit sa main prend nettement plus de prises', () => {
  // LES MÊMES GRAINES, LES MÊMES MAINS. L'un joue sa meilleure volée, l'autre
  // pose les trois premières cartes venues. Mesuré sur la flûte : 89 prises sur
  // 100 contre 2. Si cet écart se referme, la volée nue n'est plus qu'une
  // addition qu'on exécute — et il n'y a plus de jeu à jouer.
  const jouerUne = (prise, seed, applique) => {
    const P = S.nouvellePartie(CONTENU);
    const rng = rngFor(seed);
    S.engager(P, prise, rng);
    while (!P.fini) {
      const cartes = applique ? S.meilleureVolee(P).cartes : P.main.slice(0, 3);
      for (const x of cartes) S.selectionner(P, x);
      S.jouer(P);
      S.completer(P, rng);
    }
    return P.fini === 'prise';
  };
  const flute = CONTENU.prises[1];
  let bon = 0, mauvais = 0;
  for (let s = 1; s <= 100; s++) {
    if (jouerUne(flute, s * 7919, true)) bon++;
    if (jouerUne(flute, s * 7919, false)) mauvais++;
  }
  assert(bon - mauvais >= 50,
    `l’écart doit rester net : appliqué ${bon}/100, maladroit ${mauvais}/100`);
});

test('l’échelle des prises reste jouable de bout en bout', () => {
  // Il n'y a AUCUNE progression dans ce plateau — ni état-major, ni relique,
  // ni recrutement. L'échelle doit donc tenir dans ce qu'un joueur ordinaire
  // atteint avec onze cartes, sans quoi la dernière prise n'est pas difficile,
  // elle est impossible.
  const jouerUne = (prise, seed) => {
    const P = S.nouvellePartie(CONTENU);
    const rng = rngFor(seed);
    S.engager(P, prise, rng);
    while (!P.fini) {
      for (const x of S.meilleureVolee(P).cartes) S.selectionner(P, x);
      S.jouer(P);
      S.completer(P, rng);
    }
    return P.fini === 'prise';
  };
  const bad = [];
  for (const p of CONTENU.prises) {
    let n = 0;
    for (let s = 1; s <= 120; s++) if (jouerUne(p, s * 7919)) n++;
    if (n < 20) bad.push(`${p.nom} (résistance ${p.resistance}) : ${n}/120 — hors d’atteinte`);
    if (p.id !== 'barque' && n > 115) bad.push(`${p.nom} : ${n}/120 — elle se rend toute seule`);
  }
  empty(bad, 'chaque prise doit être gagnable et perdable');
});

// LES ZONES. Onze cartes, et c'est précisément ce qui rend l'invariant vital
// ici : ce plateau demande au joueur de SAVOIR ce qui reste, parce qu'il l'a vu
// passer. Une carte dupliquée ou perdue ne casse rien de visible — elle rend
// simplement fausse la seule connaissance que le plateau récompense, et la
// ligne « au paquet » posée sur le bois se met à mentir.
suite('simple — les zones');

test('les onze cartes sont toujours quelque part, et à un seul endroit', () => {
  const fautes = [];
  for (const prise of CONTENU.prises) {
    for (let s = 1; s <= 20; s++) {
      const { P, rng } = partie(prise, s * 17);
      for (let tour = 0; tour < 8 && !P.fin; tour++) {
        const ou = new Map();
        for (const [nom, tas] of [['main', P.main], ['pioche', P.pioche], ['defausse', P.defausse]])
          for (const x of tas) { if (!ou.has(x)) ou.set(x, []); ou.get(x).push(nom); }
        for (const [x, zs] of ou)
          if (zs.length > 1) fautes.push(`${prise.id}/${s}: ${x.nom} est à la fois en ${zs.join(' et en ')}`);
        if (ou.size !== 11) fautes.push(`${prise.id}/${s}/t${tour}: ${ou.size} cartes en jeu au lieu de onze`);
        for (const x of P.selection)
          if (!P.main.includes(x)) fautes.push(`${prise.id}/${s}: une carte sélectionnée n'est plus en main`);
        // `meilleureVolee` rend un OBJET (`{ total, cartes }`), pas un tableau :
        // lire `.length` dessus donne `undefined`, et la boucle sortait au
        // premier tour sans jamais jouer. Un test qui ne joue pas passe.
        const volee = S.meilleureVolee(P);
        if (!volee || !volee.cartes.length) break;
        for (const x of volee.cartes) S.selectionner(P, x);
        S.jouer(P); S.completer(P, rng);
      }
    }
  }
  empty(fautes, 'les onze cartes ne se comptent plus');
});

test('« au paquet » dit la vérité, tour après tour', () => {
  // La ligne posée sur le bois est le seul relevé du plateau. Si elle s'écarte
  // du contenu réel de la pioche, cacher le compte aurait mieux valu que le
  // donner faux.
  const { P, rng } = partie(SANS_FIN, 3);
  for (let tour = 0; tour < 6 && !P.fin; tour++) {
    const dit = S.resteParType(P);
    const vrai = {};
    for (const x of P.pioche) vrai[x.id] = (vrai[x.id] || 0) + 1;
    for (const id of new Set([...Object.keys(dit), ...Object.keys(vrai)]))
      equal(dit[id] || 0, vrai[id] || 0, `« au paquet » annonce ${dit[id] || 0} ${id} pour ${vrai[id] || 0} en pioche`);
    const volee = S.meilleureVolee(P);
    if (!volee || !volee.cartes.length) break;
    for (const x of volee.cartes) S.selectionner(P, x);
    S.jouer(P); S.completer(P, rng);
  }
});

test('la défausse se rebat : onze cartes ne suffisent pas à quatre bordées', () => {
  // Trois cartes par volée, quatre bordées : douze cartes tirées d'un paquet de
  // onze. Le rebattage n'est donc pas un cas limite ici, c'est le cas NORMAL —
  // et sans lui la dernière bordée se jouerait à une main dépeuplée, en
  // silence.
  const { P, rng } = partie(SANS_FIN, 9);
  // Tout à la défausse — la main COMPRISE : une carte qu'on retire d'un tas
  // sans la poser dans un autre est exactement la faute que ce test surveille.
  P.defausse.push(...P.pioche.splice(0), ...P.main.splice(0));
  S.completer(P, rng);
  assert(P.main.length > 0, 'pioche vide et défausse pleine : la main est restée vide');
  equal(P.main.length + P.pioche.length + P.defausse.length, 11, 'le rebattage a perdu ou fabriqué des cartes');
});

// L'ÉCHELLE DES PRISES EST MESURÉE, PAS CHOISIE À L'ŒIL. Les cinq résistances
// sortent de 3 000 rencontres jouées à la meilleure volée, sur trois familles de
// graines dont les résultats s'écartent de moins d'un point. Elles ne veulent
// rien dire hors du paquet qui les a produites : le jour où le paquet change,
// elles se relisent toutes les cinq, et c'est ce test qui le dira.
suite('simple — l’échelle est mesurée');

const jouerUne = (prise, seed, applique) => {
  const P = S.nouvellePartie(CONTENU);
  const rng = rngFor(seed);
  S.engager(P, prise, rng);
  while (!P.fini) {
    const cartes = applique ? S.meilleureVolee(P).cartes : P.main.slice(0, 3);
    for (const x of cartes) S.selectionner(P, x);
    S.jouer(P);
    S.completer(P, rng);
  }
  return P.fini === 'prise';
};

test('les cinq prises forment une vraie échelle, du certain au presque impossible', () => {
  // Les bandes sont larges — ce qu'on tient, c'est la FORME de l'échelle, pas
  // une décimale. Si deux barreaux se rejoignent, il y a deux prises qui font
  // le même jeu, et l'une des deux ne sert à rien.
  const attendu = [
    ['barque',   90, 100],
    ['flute',    78,  95],
    ['galion',   62,  85],
    ['fregate',  22,  48],
    ['vaisseau', 10,  34],
  ];
  const bad = [];
  let precedent = 101;
  for (const [id, bas, haut] of attendu) {
    const prise = CONTENU.prises.find((p) => p.id === id);
    let pris = 0;
    for (let s = 1; s <= 100; s++) if (jouerUne(prise, s * 7919, true)) pris++;
    if (pris < bas || pris > haut)
      bad.push(`${prise.nom} (R=${prise.resistance}) se prend ${pris}/100, hors de la bande ${bas}–${haut}`);
    if (pris >= precedent)
      bad.push(`${prise.nom} n’est pas plus dure que la précédente : ${pris}/100 contre ${precedent}/100`);
    precedent = pris;
  }
  empty(bad, 'l’échelle des prises a bougé — les résistances sont à remesurer, pas le test à élargir');
});

test('la plus grosse prise reste hors de portée, et il n’y a rien à acheter', () => {
  // CE PLATEAU N'A AUCUNE PROGRESSION : ni état-major, ni relique, ni
  // recrutement. L'échelle doit donc tenir ENTIÈRE dans ce qu'on atteint avec
  // onze cartes — une résistance qu'aucune main ne peut couvrir ne serait pas
  // un défi, seulement un mur.
  const vaisseau = CONTENU.prises[CONTENU.prises.length - 1];
  let pris = 0;
  for (let s = 1; s <= 200; s++) if (jouerUne(vaisseau, s * 31, true)) pris++;
  assert(pris > 0, `${vaisseau.nom} n’est prise aucune fois sur 200 — sa résistance est un mur`);
  assert(pris < 90, `${vaisseau.nom} tombe ${pris} fois sur 200 : ce n’est plus le sommet de l’échelle`);
});
