// LA VOLÉE NUE — les règles du plateau simplifié.
//
// C'EST UN AUTRE ENVIRONNEMENT, pas une réécriture de `src/cartes.js`. Celui-ci
// garde l'état-major, les reliques, la carte annoncée par la prise, les
// rechargements et les trois fins. Ici, il ne reste QUE :
//
//   ON A ONZE CARTES, ET RIEN D'AUTRE. Quatre boulets ramés, quatre mitrailles,
//   trois boulets rouges — les rares, et les plus lourds. Un paquet qu'on
//   compte sur les doigts : au troisième tour, un joueur SAIT ce qui reste,
//   parce qu'il l'a vu passer. C'est la seule connaissance que ce jeu demande,
//   et c'est la seule qu'il récompense.
//
//   LA PUISSANCE VIENT DE DEUX CHOSES, ET DE DEUX SEULEMENT : le TYPE de
//   chaque carte, et ce que la MAIN assortit — une paire, une triplette. Il n'y
//   a pas de troisième chose à savoir. Pas de fureur, pas de multiplicateur, pas
//   de bord, pas d'effet de carte, pas de riposte, pas de rechargement : tout ce
//   qui demandait de tenir un second chiffre en tête a été retiré, y compris ce
//   qui était bon.
//
//   ON POUSSE LA VOLÉE VERS LE HAUT, elle part. C'est le seul ordre du jeu.
//
// LES DEUX FINS. La résistance atteinte → la prise, butin plein. Plus une
// bordée → elle s'échappe, et l'on n'a rien. La coulée a disparu avec la coque :
// une seconde façon de gagner qui rendait moins était une exception de plus.
//
// RÈGLE 1 DU DÉPÔT : aucune entropie ici. Le battage prend un `rng` en argument
// parce qu'il relève de la GÉNÉRATION ; évaluer une volée n'en prend jamais. La
// même main jouée deux fois donne deux fois le même chiffre.
//
// RÈGLE 5 : un ordre impossible rend `{ ok: false, pourquoi }`, jamais un
// silence.

// Cinq cartes en main sur onze au paquet : on en voit près de la moitié à
// chaque instant, et ce qui manque se déduit. Trois par volée, comme les trois
// cartes d'une figure — la triplette doit être atteignable, sinon elle n'est
// qu'un chiffre écrit dans un tableau.
export const MAIN = 5;
export const VOLEE_MAX = 3;

// QUATRE BORDÉES POUR ATTEINDRE LA RÉSISTANCE. C'est le seul compteur de
// rareté qui reste : une main mal lue ne se rattrape pas au tour suivant, parce
// qu'il n'y a que quatre tours.
export const BORDEES = 4;

/* ------------------------------------------------------------ la volée */

// CE QUE VAUT UNE CARTE : sa poudre, celle de son type. Toutes les cartes du
// même nom valent la même chose — c'est exactement ce qui permet aux figures
// d'exister, et c'est pour cela que le paquet n'a que trois types.
export const poudreDe = (c) => c.poudre || 0;

// LA FIGURE : deux cartes du même type, ou trois. Rien d'autre n'est une
// figure. La « panachée » — trois types tous différents — a été retirée avec le
// reste : elle demandait de vérifier une seconde condition, en sens inverse de
// la première, pour un jeu dont toute la promesse est qu'on lit sa main d'un
// coup d'œil.
export function figureDe(cartes) {
  if (cartes.length < 2) return null;
  const compte = {};
  for (const c of cartes) compte[c.id] = (compte[c.id] || 0) + 1;
  const pic = Math.max(...Object.values(compte));
  if (pic >= 3) return 'triplette';
  if (pic >= 2) return 'paire';
  return null;
}

// LE COMPTE D'UNE VOLÉE, EN UN SEUL CHIFFRE, ET TOUT S'ADDITIONNE. Les cartes,
// puis ce que leur assortiment ajoute. Il n'y a pas de produit à faire, donc
// pas de moment où le joueur doit calculer avant de pouvoir décider.
//
// CHAQUE LIGNE DIT D'OÙ ELLE VIENT (`source`, `uid`/`id`). Ça ne change rien au
// total : ça sert à l'écran, qui joue le score EN SÉQUENCE et doit savoir quoi
// faire bondir à chaque étape — cette carte-ci, puis le nom de la figure.
export function evaluer(P, cartes) {
  const lignes = [];
  let total = 0;
  for (const c of cartes) {
    const n = poudreDe(c);
    lignes.push({ quoi: c.nom, poudre: n, source: 'carte', uid: c.uid });
    total += n;
  }
  const id = figureDe(cartes);
  const fig = id ? P.contenu.figures.find((f) => f.id === id) : null;
  if (fig) {
    lignes.push({ quoi: fig.nom, note: fig.texte, poudre: fig.poudre, source: 'figure', id });
    total += fig.poudre;
  }
  return { lignes, figure: id, figureNom: fig ? fig.nom : null, total, pression: total };
}

/* ------------------------------------------------------------ la partie */

let uid = 0;
const carte = (def) => ({ ...def, uid: ++uid });

// LE PAQUET EST MONTÉ DEPUIS LES DONNÉES : `deck` dit combien d'exemplaires de
// chaque type. Onze cartes est un RÉGLAGE, pas une règle — changer le compte ou
// ajouter un type ne demande aucune ligne de code.
export function monterLeDeck(contenu) {
  const parId = Object.fromEntries(contenu.cartes.map((c) => [c.id, c]));
  const paquet = [];
  for (const [id, n] of Object.entries(contenu.deck)) {
    for (let i = 0; i < n; i++) if (parId[id]) paquet.push(carte({ ...parId[id] }));
  }
  return paquet;
}

export function melanger(liste, rng) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nouvellePartie(contenu) {
  return {
    contenu,
    deck: monterLeDeck(contenu),
    butin: 0, prisesFaites: 0,
    prise: null,
    pioche: [], main: [], defausse: [], selection: [],
    pression: 0, bordees: BORDEES, tour: 1, fini: null,
  };
}

export function engager(P, defPrise, rng) {
  P.prise = { ...defPrise };
  P.pression = 0;
  P.bordees = BORDEES;
  P.tour = 1;
  P.fini = null;
  P.pioche = melanger(P.deck, rng);
  P.main = []; P.defausse = []; P.selection = [];
  completer(P, rng);
  return true;
}

// LA MAIN SE REMPLIT À RAS après chaque volée. On pioche avec `pop()` : la fin
// du tableau est le DESSUS du paquet. Le paquet épuisé, la défausse est
// rebattue — sur onze cartes, cela arrive deux fois par rencontre, et c'est
// voulu : le joueur revoit passer ce qu'il a joué.
export function completer(P, rng) {
  while (P.main.length < MAIN) {
    if (!P.pioche.length) {
      if (!P.defausse.length) break;
      P.pioche = melanger(P.defausse, rng);
      P.defausse = [];
    }
    P.main.push(P.pioche.pop());
  }
}

// AUCUNE CONTRAINTE DE COMPOSITION : n'importe quelles cartes de la main, une à
// trois. Le refus ne porte jamais sur la carte, seulement sur le nombre.
export function selectionner(P, c) {
  if (P.fini) return { ok: false, pourquoi: 'La prise est jouée.' };
  const i = P.selection.indexOf(c);
  if (i >= 0) { P.selection.splice(i, 1); return { ok: true }; }
  if (!P.main.includes(c)) return { ok: false, pourquoi: 'Cette carte n’est pas en main.' };
  if (P.selection.length >= VOLEE_MAX) return { ok: false, pourquoi: `${VOLEE_MAX} cartes au plus dans une volée.` };
  P.selection.push(c);
  return { ok: true };
}

// TIRER. Ne pioche pas : le tirage relève de la génération et reste chez
// l'appelant, qui tient le `rng`.
export function jouer(P) {
  if (P.fini || !P.selection.length) return null;
  const r = evaluer(P, P.selection);
  P.pression += r.pression;
  P.bordees -= 1;
  P.tour += 1;
  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    P.defausse.push(c);
  }
  P.selection = [];

  // LES DEUX FINS, dans cet ordre : la résistance atteinte l'emporte sur la
  // dernière bordée dépensée. Une volée qui atteint le seuil du dernier coup
  // est une prise, pas une évasion.
  if (P.pression >= P.prise.resistance) denouement(P, 'prise');
  else if (P.bordees <= 0) denouement(P, 'echec');
  return r;
}

function denouement(P, fin) {
  P.fini = fin;
  P.prise.gagne = fin === 'prise' ? P.prise.butin : 0;
  if (fin === 'prise') { P.butin += P.prise.gagne; P.prisesFaites += 1; }
}

// LA MEILLEURE VOLÉE JOUABLE. Elle sert à l'aide et — surtout — aux tests : si
// un joueur qui lit sa main ne fait pas nettement mieux qu'un joueur qui pose
// les trois premières cartes venues, le choix ne compte pas et la manche ne
// sert à rien. Onze cartes, cinq en main : l'énumération est exhaustive.
export function meilleureVolee(P) {
  const m = P.main;
  let best = null;
  for (let masque = 1; masque < (1 << m.length); masque++) {
    const cartes = [];
    for (let i = 0; i < m.length; i++) if (masque & (1 << i)) cartes.push(m[i]);
    if (cartes.length > VOLEE_MAX) continue;
    const r = evaluer(P, cartes);
    if (!best || r.total > best.total) best = { ...r, cartes };
  }
  return best;
}

// CE QU'IL RESTE DANS LE PAQUET, par type. Sur onze cartes, c'est l'unique
// chose qu'un joueur ait à retenir — donc l'écran a le droit de la lui montrer.
export function resteParType(P) {
  const compte = {};
  for (const c of P.pioche) compte[c.id] = (compte[c.id] || 0) + 1;
  return compte;
}
