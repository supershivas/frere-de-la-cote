// La chasse-partie en cartes — les règles.
//
// LE TOUR : on choisit des MUNITIONS dans sa main, on tire, puis la prise joue
// la carte qu'elle a ANNONCÉE au tour précédent. Rien n'est caché, rien n'est
// tiré au dé : un tour est un problème fermé.
//
// LE DECK EST FAIT DE MUNITIONS, PAS D'HOMMES. Cinq munitions, génériques et
// répétées, comme les figures d'un jeu de 52 : boulet ramé, boulet rouge,
// mitraille, chaîne, barrique. Chacune existe en plusieurs exemplaires, à
// bâbord ET à tribord. Un deck fait d'hommes nommés ne pouvait pas former de
// figures — chaque carte était unique, donc aucune main ne ressemblait à une
// autre et il n'y avait rien à reconnaître.
//
// L'ÉQUIPAGE A QUITTÉ LE DECK. Il est devenu l'ÉTAT-MAJOR : cinq hommes nommés
// au plus, visibles en permanence, qui ne se jouent jamais et changent chacun
// UNE RÈGLE. Ils remplacent à la fois les officiers et les recrues d'avant.
//
// CE QUI FAIT LE JEU, ET RIEN D'AUTRE :
//
//   AUCUNE CONTRAINTE DE COMPOSITION. Une volée, c'est une à trois munitions
//   de la main, prises comme on veut. Bâbord et tribord ont été retirés : ils
//   interdisaient de mêler les deux côtés, ce qui rendait une main sur deux à
//   moitié injouable et transformait la moitié des tours en attente plutôt
//   qu'en décision. Ce qui décide, ce sont les FIGURES.
//
//   LES DEUX AXES D'UNE VOLÉE. La POUDRE est la somme des munitions ; la
//   FUREUR part à 1 et monte avec les figures — trois fois la même munition,
//   trois toutes différentes, ou une simple paire. `total = poudre × fureur`.
//   Les figures portent sur les MUNITIONS, ce qui est possible précisément
//   parce qu'elles se répètent.
//
//   LA RÉSISTANCE. Une prise annonce AVANT l'engagement la PRESSION qu'il
//   faut lui mettre pour qu'elle amène son pavillon. C'est un seuil, comme
//   une ante : QUATRE bordées pour l'atteindre, trois rechargements pour
//   améliorer sa main sans tirer. On ne perd pas en coulant — on n'a pas de
//   coque — on perd en MANQUANT le seuil.
//
//   LA MITRAILLE ANNULE. La carte que la prise a annoncée ne tombe pas si une
//   mitraille est de la volée. C'est le seul moyen de l'empêcher, et il coûte
//   une des trois places.
//
// CE QUI A ÉTÉ RETIRÉ, et qu'il ne faut pas reconstruire : les métiers, les
// quarts, l'avant et l'arrière, les valeurs individuelles, la distinction
// recrue/officier, bâbord et tribord, les mâts et le démâtage, la météo
// en combat (elle reste le décor du ciel), les règles de prise, les points de
// vie de La Tortue et la riposte chiffrée.
//
// RÈGLE 1 DU DÉPÔT : aucune entropie ici — pas de tirage, pas d'horloge, pas
// de source cryptographique. Le battage prend un `rng` en argument parce qu'il
// relève de la GÉNÉRATION ; la résolution n'en prend jamais. Une barrique
// retire la PIRE munition en main, pas une au hasard : c'est prévisible, donc
// c'est jouable.
//
// RÈGLE 5 : un ordre impossible rend un refus MOTIVÉ (`{ ok: false, pourquoi }`),
// jamais un silence.

// Trois munitions au plus dans une volée, cinq en main. Des cartes plus
// grandes se lisent au pouce ; sept qui se partagent 375 px ne se lisent pas.
export const MAIN_MAX = 3;
// Les écouvillons achètent une PLACE DE PLUS dans la volée.
export const voleeMax = (P) => MAIN_MAX + (P.reliques.includes('ecouvillons') ? 1 : 0);

// LA RENCONTRE EST UNE ANTE : quatre bordées pour atteindre la résistance de
// la prise, trois rechargements pour se refaire une main entre deux. Ces deux
// chiffres SONT le jeu — c'est d'eux que vient la rareté.
export const BORDEES = 4;
export const RECHARGEMENTS = 3;
export const ETAT_MAJOR_MAX = 5;

export const bordeesDe = (P) => BORDEES + (P.reliques.includes('double_fond') ? 1 : 0);
export const rechargementsDe = () => RECHARGEMENTS;

const FEU = { id: 'feu', nom: 'Feu', poudre: 0, effet: null };
export const estFeu = (c) => c.id === 'feu';



// L'ÉTAT-MAJOR : cinq hommes nommés au plus. Ils ne se jouent pas — ils sont
// là, et chacun change UNE RÈGLE. Leur nom, leur titre, leur texte et leur
// prix sont du contenu (`data/equipage.json`) ; leur VERBE est une règle, donc
// il vit ici. C'est la seule chose du jeu qui demande une ligne de code pour
// être ajoutée, et c'est voulu : un homme qui ne changerait aucune règle ne
// serait qu'un texte de plus sur l'écran.
export const aHomme = (P, id) => P.hommes.includes(id);

// CE QUE VAUT UNE MUNITION. Il n'y a plus de valeur individuelle : la poudre
// d'un boulet ramé est celle de tous les boulets ramés — c'est ce qui permet
// aux figures d'exister. Une munition MOUILLÉE ne vaut plus rien jusqu'à la
// fin de la rencontre.
export function poudreDe(c, P = null) {
  if (estFeu(c) || c.mouillee) return 0;
  const base = c.poudre || 0;
  // Etcheverry est chef de pièce au fourneau : ses boulets rouges comptent double.
  if (c.id === 'boulet_rouge' && P && aHomme(P, 'etcheverry')) return base * 2;
  return base;
}
// L'ancien nom, gardé le temps que rien ne l'appelle plus.
export const valeur = poudreDe;

/* ------------------------------------------------------------ la volée */

// LA MITRAILLE ANNULE LA CARTE ANNONCÉE. C'est le seul moyen de l'empêcher, et
// il coûte une des trois places de la volée : c'est là tout son prix.
export const annuleLAnnonce = (P, cartes) => cartes.some((c) => c.id === 'mitraille');

// LA FIGURE D'UNE VOLÉE. Elle porte sur les MUNITIONS, ce qui n'était possible
// qu'une fois le deck fait de cartes qui se répètent : avec des hommes tous
// différents, aucune main ne ressemblait à une autre et il n'y avait rien à
// reconnaître. Trois fois la même, trois toutes différentes, ou une paire.
export function figureDe(cartes) {
  const m = cartes.filter((c) => !estFeu(c));
  if (m.length < 2) return null;
  const compte = {};
  for (const c of m) compte[c.id] = (compte[c.id] || 0) + 1;
  const pics = Object.values(compte).sort((a, b) => b - a);
  const distincts = Object.keys(compte).length;
  if (m.length >= 3 && pics[0] >= 3) return 'triplette';
  if (m.length >= 3 && distincts === m.length) return 'panachee';
  if (pics[0] >= 2) return 'paire';
  return null;
}

// LE COMPTE D'UNE VOLÉE, SUR DEUX AXES.
//
//   LA POUDRE, c'est ce que les munitions valent : la somme de leurs poudres.
//   LA FUREUR, c'est ce que leur assortiment vaut : elle part à 1, chaque
//   apport en ajoute, TOUTES LES FUREURS S'ADDITIONNENT, et la somme multiplie
//   la poudre UNE SEULE FOIS.
//
//     total = poudre × fureur
//
// Deux axes plutôt qu'un tas de points, parce qu'ils ne se remplacent pas :
// trois boulets ramés font une grosse poudre et une fureur ordinaire ; une
// triplette de mitrailles fait l'inverse. Le joueur voit ce qu'il construit, et
// le détail dit de quel côté vient chaque gain — d'où les lignes qui portent
// l'un OU l'autre.
export function evaluer(P, cartes) {
  const munitions = cartes.filter((c) => !estFeu(c));
  const lignes = [];
  const synergies = [];

  /* --- LA POUDRE : ce que les munitions valent ------------------------- */
  let poudre = 0;
  for (const c of cartes) {
    if (estFeu(c)) { lignes.push({ quoi: 'Feu', note: 'encombre la volée', poudre: 0 }); continue; }
    if (c.mouillee) { lignes.push({ quoi: c.nom, note: 'mouillée — elle ne prend pas', poudre: 0 }); continue; }
    const v = poudreDe(c, P);
    const double = c.id === 'boulet_rouge' && aHomme(P, 'etcheverry');
    lignes.push({ quoi: c.nom, note: double ? 'Etcheverry le sort du fourneau' : null, poudre: v });
    poudre += v;
  }
  if (P.reliques.includes('caronades')) { lignes.push({ quoi: 'Caronades', note: null, poudre: 6 }); poudre += 6; }

  /* --- LA FUREUR : ce que leur assortiment vaut ------------------------ */
  let fureur = 1;
  const ajoute = (f, quoi, note) => { fureur += f; lignes.push({ quoi, note, fureur: f }); };

  // Ce que les munitions apportent d'elles-mêmes.
  const rouges = munitions.filter((c) => c.id === 'boulet_rouge' && !c.mouillee).length;
  if (rouges) ajoute(0.5 * rouges, rouges > 1 ? `${rouges} boulets rouges` : 'Boulet rouge', 'chauffé au rouge');

  // La figure.
  const fig = figureDe(cartes);
  const FIGURES = {
    triplette: { nom: 'Triplette', f: 2, note: 'trois fois la même munition' },
    panachee: { nom: 'Panachée', f: 1.5, note: 'trois munitions toutes différentes' },
    paire: { nom: 'Paire', f: 1, note: 'deux munitions identiques' },
  };
  if (fig) {
    const F = FIGURES[fig];
    synergies.push(F.nom);
    ajoute(F.f, F.nom, F.note);
    // Les grappins visaient des abordeurs, qui n'existent plus. Ils paient la
    // figure la plus difficile à réunir.
    if (fig === 'triplette' && P.reliques.includes('grappins')) ajoute(1, 'Grappins neufs', 'la triplette est tenue');
  }

  // Gohier ouvre la rencontre : la PREMIÈRE volée porte +1.
  if (aHomme(P, 'gohier') && P.bordees === bordeesDe(P)) ajoute(1, 'Gohier', 'la première volée de la rencontre');

  // LA CHAÎNE d'une volée précédente double la fureur de celle-ci. Elle
  // s'applique APRÈS toutes les additions, parce qu'elle porte sur leur somme :
  // c'est ce qui en fait une mise en place plutôt qu'un bonus de plus.
  if (P.chaine) { lignes.push({ quoi: 'Chaîne', note: 'la volée précédente a doublé la fureur', fureur: fureur }); fureur *= 2; }

  const total = Math.round(poudre * fureur);

  return {
    lignes, synergies, figure: fig,
    poudre, fureur, total,
    pression: total,
    degats: total,
    annule: annuleLAnnonce(P, cartes),
    // La chaîne arme la volée SUIVANTE, jamais la sienne.
    arme: munitions.some((c) => c.id === 'chaine' && !c.mouillee),
    // La barrique ne tire pas : elle jette une munition ratée par-dessus bord.
    barriques: munitions.filter((c) => c.id === 'barrique').length,
  };
}

// CE QU'UNE BARRIQUE JETTE : la PIRE munition de la main, et d'abord un Feu
// s'il y en a un — un Feu est la définition même d'une munition ratée, et
// depuis que le charpentier a quitté le deck, c'est le seul moyen d'en sortir.
// Déterministe : la pire, jamais une au hasard (règle 1).
export function pireDeLaMain(P, sauf = []) {
  const dispo = P.main.filter((c) => !sauf.includes(c));
  const feu = dispo.find(estFeu);
  if (feu) return feu;
  return dispo.slice().sort((a, b) => poudreDe(a, P) - poudreDe(b, P) || a.uid - b.uid)[0] || null;
}

/* ------------------------------------------------------------ la partie */

let uid = 0;
const carte = (def) => ({ ...def, uid: ++uid, mouillee: false });
const feu = () => carte(FEU);

// LE PAQUET, MONTÉ DEPUIS LES DONNÉES. `deck` dit combien d'exemplaires de
// chaque munition ; c'est du contenu, parce que la composition du
// paquet est un réglage et pas une règle. Ajouter une munition ou en changer
// le nombre ne demande aucune ligne de code.
export function monterLeDeck(contenu) {
  const parId = Object.fromEntries(contenu.munitions.map((m) => [m.id, m]));
  const cartes = [];
  for (const [id, n] of Object.entries(contenu.deck)) {
    for (let i = 0; i < n; i++) if (parId[id]) cartes.push(carte({ ...parId[id] }));
  }
  return cartes;
}

export function melanger(liste, rng) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function nouvellePartie(contenu) {
  return {
    contenu,
    // LE PAQUET, et L'ÉTAT-MAJOR à côté. Les hommes ne sont plus dedans : ils
    // sont visibles en permanence et ne se jouent jamais.
    deck: monterLeDeck(contenu),
    hommes: [],
    reliques: [], butin: 0, prisesFaites: 0,
    // LA TORTUE N'A PLUS DE POINTS DE VIE. On ne perd plus en coulant : on
    // perd en manquant le seuil, et c'est la seule façon.
    prise: null,
    pioche: [], main: [], defausse: [], selection: [],
    meteo: null, fini: null, journal: [], tour: 1,
    pression: 0, bordees: BORDEES, rechargements: RECHARGEMENTS,
    // La chaîne arme la volée SUIVANTE ; les deux verbes « une fois par
    // rencontre » se rechargent à l'engagement.
    chaine: false, toussaintFait: false, ozanneFait: false, derniereVolee: null,
  };
}

export const tailleMain = (P) => 5 + (P.reliques.includes('longue_vue') ? 1 : 0);

// LA MAIN SE REMPLIT À RAS, après chaque bordée comme après chaque
// rechargement. La rareté ne vient plus du nombre d'hommes qu'on reçoit — elle
// vient du nombre de COUPS : quatre bordées, trois rechargements, et la
// résistance de la prise en face. La relève de deux et sa constante RELEVE
// sont supprimées ; c'est le seuil qui fait maintenant la décision.

export function engager(P, defPrise, meteo, rng) {
  // La suite d'intentions est TIRÉE à l'engagement (génération) puis figée :
  // pendant le combat, elle se déroule sans le moindre dé. Sa composition est
  // du contenu — `intentions_deck` dans data/equipage.json — parce que la
  // pression qu'une prise met par tour est un réglage, pas une règle.
  const parId = Object.fromEntries(P.contenu.intentions.map((i) => [i.id, i]));
  const paquet = (P.contenu.intentions_deck || P.contenu.intentions.map((i) => i.id))
    .map((id) => parId[id]).filter(Boolean);
  const ints = melanger(paquet, rng);
  P.prise = {
    ...defPrise, pv: defPrise.pv, max: defPrise.pv,
    resistance: defPrise.resistance,
    // LA HUNE donne une vigie : la première carte annoncée de la rencontre est
    // coupée d'office. La relique abattait un mât sous le seuil, et il n'y a
    // plus ni mât ni seuil.
    intentions: ints, i: 0, annonce: ints[0], tirAnnule: P.reliques.includes('hune'),
    // COUDRAY VOIT LES DEUX PROCHAINES MUNITIONS — pas la carte suivante de la
    // prise. La vigie de la relique, elle, coupe la première annonce.
    suivante: null,
  };
  // Les deux compteurs de la rencontre, annoncés avant qu'on engage.
  P.pression = 0;
  P.bordees = bordeesDe(P);
  P.rechargements = rechargementsDe();
  // La météo est passée en DÉCOR : on la garde sur la partie pour le ciel et
  // la houle, aucune règle ne la lit plus.
  P.meteo = meteo || null;
  P.tour = 1;
  P.pioche = melanger(P.deck, rng);
  for (const c of P.deck) c.mouillee = false;
  P.chaine = false; P.toussaintFait = false; P.ozanneFait = false; P.derniereVolee = null;
  P.main = []; P.defausse = []; P.selection = [];
  P.fini = null; P.journal = [];
  completer(P, rng);
  return true;
}

// On remplit la main à ras. `combien` ne sert plus qu'à en donner moins que
// tout — la partie, elle, appelle toujours sans argument.
export function completer(P, rng, combien = null) {
  const cible = combien == null ? tailleMain(P)
    : Math.min(tailleMain(P), P.main.length + combien);
  while (P.main.length < cible) {
    if (!P.pioche.length) {
      if (!P.defausse.length) break;
      P.pioche = melanger(P.defausse, rng); P.defausse = [];
    }
    P.main.push(P.pioche.pop());
  }
}

// Un homme est-il en état de tirer ce tour-ci ? Rend un refus motivé, parce
// qu'un homme grisé sans explication est un bug pour le joueur.
export function peutJouer(P, c) {
  if (P.fini) return { ok: false, pourquoi: 'La prise est jouée.' };
  if (estFeu(c)) return { ok: true };
  // PLUS AUCUNE CONTRAINTE DE COMPOSITION. Bâbord et tribord interdisaient de
  // mêler les deux côtés : une main sur deux était à moitié injouable, et la
  // moitié des tours devenait une attente plutôt qu'une décision. Ce qui reste
  // et qui décide, ce sont les figures.
  return { ok: true };
}

export function selectionner(P, c) {
  const i = P.selection.indexOf(c);
  if (i >= 0) { P.selection.splice(i, 1); return { ok: true }; }
  if (P.selection.length >= voleeMax(P)) return { ok: false, pourquoi: `${voleeMax(P)} hommes au plus dans une volée.` };
  if (!P.main.includes(c)) return { ok: false, pourquoi: 'Cet homme n’est pas en main.' };
  const q = peutJouer(P, c);
  if (!q.ok) return q;
  P.selection.push(c);
  return { ok: true };
}

// Joue la volée. Ne pioche pas : le tirage relève de la génération et reste
// chez l'appelant, qui tient le `rng`.
export function jouer(P) {
  if (P.fini || !P.selection.length) return null;
  const r = evaluer(P, P.selection);
  const prise = P.prise;
  const evenements = [];

  if (r.degats > 0) {
    prise.pv = Math.max(0, prise.pv - r.degats);
    evenements.push({ type: 'coque', degats: r.degats });
  }
  // LA PRESSION MONTE À CHAQUE VOLÉE : c'est elle que le joueur regarde, et
  // c'est elle qui décide.
  P.pression += r.pression;
  P.bordees -= 1;

  // LA MITRAILLE ANNULE LA CARTE ANNONCÉE. Elle est de la volée ou elle n'y
  // est pas : ni seuil à franchir, ni conditions à réunir.
  if (r.annule) {
    prise.tirAnnule = true;
    evenements.push({ type: 'annule' });
    P.journal.push(`La mitraille balaie son pont — ${prise.nom} n’aura pas sa carte.`);
  }

  // LA BARRIQUE JETTE UNE MUNITION RATÉE PAR-DESSUS BORD, définitivement : la
  // carte sort de la PARTIE, pas de la main. C'est le seul moyen d'amincir son
  // paquet, et le seul moyen de se débarrasser d'un Feu.
  for (let i = 0; i < r.barriques; i++) {
    const pire = pireDeLaMain(P, P.selection);
    if (!pire) { P.journal.push('La barrique part à l’eau : rien à jeter avec.'); break; }
    retirerDeLaPartie(P, pire);
    evenements.push({ type: 'barrique', quoi: pire.nom });
    P.journal.push(`${pire.nom} passe par-dessus bord — elle ne reviendra pas.`);
  }

  // On garde la volée jouée pour Ozanne, AVANT de vider la sélection.
  P.derniereVolee = P.selection.slice();
  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];

  // LA CHAÎNE ARME LA VOLÉE SUIVANTE, jamais la sienne. On efface d'abord le
  // drapeau que cette volée-ci vient de consommer, puis on repose celui
  // qu'elle laisse : sans cet ordre, une chaîne se doublait elle-même.
  P.chaine = r.arme;

  // LES TROIS FINS. On regarde la PRESSION d'abord : une prise qui amène son
  // pavillon se rend entière, même si le même boulet l'aurait envoyée par le
  // fond. Coulée, on ne repêche que ce qui flotte. Et c'est SA coque à elle —
  // La Tortue n'a pas de points de vie, on ne perd pas en coulant.
  if (P.pression >= prise.resistance) denouement(P, 'prise');
  else if (prise.pv <= 0) denouement(P, 'coulee');
  return { ...r, evenements };
}

// Sortir une carte de la PARTIE, où qu'elle soit. Une munition jetée
// par-dessus bord ne revient pas par la défausse : c'est ce qui distingue un
// amincissement d'une défausse, et c'est tout l'intérêt de la barrique.
export function retirerDeLaPartie(P, c) {
  for (const zone of [P.main, P.pioche, P.defausse, P.deck, P.selection]) {
    const i = zone.indexOf(c);
    if (i >= 0) zone.splice(i, 1);
  }
}

/* ------------------------------------------------- les verbes de l'état-major
   Deux hommes agissent SUR ORDRE, une fois par rencontre. Ce sont les seuls
   ordres du jeu qui ne soient pas une volée, et chacun rend un refus motivé
   plutôt qu'un silence (règle 5). */

// TOUSSAINT retire une munition de la main — celle qu'on lui désigne, pas la
// pire : c'est un ordre, pas un automatisme, et c'est ce qui le distingue de
// la barrique.
export function toussaint(P, c, rng) {
  if (!aHomme(P, 'toussaint')) return { ok: false, pourquoi: 'Toussaint n’est pas à bord.' };
  if (P.toussaintFait) return { ok: false, pourquoi: 'Toussaint a déjà fait son office cette fois-ci.' };
  if (!c || !P.main.includes(c)) return { ok: false, pourquoi: 'Désigne une munition de ta main.' };
  retirerDeLaPartie(P, c);
  P.toussaintFait = true;
  completer(P, rng);
  return { ok: true, retiree: c };
}

// OZANNE rejoue la volée précédente : les mêmes munitions, reprises dans la
// défausse et remises en main. Il ne la rejoue pas tout seul — il la REMET, et
// c'est au joueur de la tirer, avec la bordée que ça coûte.
export function ozanne(P) {
  if (!aHomme(P, 'ozanne')) return { ok: false, pourquoi: 'Ozanne n’est pas à bord.' };
  if (P.ozanneFait) return { ok: false, pourquoi: 'Ozanne a déjà fait son office cette fois-ci.' };
  const volee = (P.derniereVolee || []).filter((c) => P.defausse.includes(c));
  if (!volee.length) return { ok: false, pourquoi: 'Aucune volée à rejouer.' };
  if (P.main.length + volee.length > tailleMain(P) + volee.length) return { ok: false, pourquoi: 'Ta main est pleine.' };
  for (const c of volee) {
    const i = P.defausse.indexOf(c);
    if (i >= 0) P.defausse.splice(i, 1);
    P.main.push(c);
  }
  P.ozanneFait = true;
  P.selection = volee.slice();
  return { ok: true, volee };
}

// COUDRAY voit les DEUX PROCHAINES munitions de la pioche. C'est de
// l'information pure : elle ne change rien au tirage, elle change ce qu'on
// garde en main ce tour-ci. On pioche avec `pop()` — le dessus du paquet est
// la fin du tableau.
export const aVenir = (P) => (aHomme(P, 'coudray') ? P.pioche.slice(-2).reverse() : []);

// Les trois dénouements en un seul endroit. Deux sont des victoires et ne
// diffèrent que par le butin ; la troisième ne rend rien.
const PART_COULEE = 0.3;
function denouement(P, fin) {
  const prise = P.prise;
  P.fini = fin;
  if (fin === 'echec') { prise.prime = 0; prise.gagne = 0; return; }
  const prime = fin === 'prise' && prise.abordee ? Math.round(prise.butin * 0.3) : 0;
  const gagne = fin === 'prise' ? prise.butin + prime : Math.round(prise.butin * PART_COULEE);
  prise.prime = prime;
  prise.gagne = gagne;
  P.butin += gagne;
  P.prisesFaites += 1;
}

// LE RECHARGEMENT : on renvoie de un à trois hommes au fond et on en reprend
// autant, SANS TIRER. La prise ne riposte pas — c'est un tour qu'on prend sur
// son propre compteur, pas sur le sien. Trois pour la rencontre entière.
export function recharger(P, rng) {
  if (P.fini) return { ok: false, pourquoi: 'La prise est jouée.' };
  if (!P.selection.length) return { ok: false, pourquoi: 'Personne à renvoyer.' };
  if (P.rechargements <= 0) return { ok: false, pourquoi: 'Plus un grain de poudre à réserver.' };
  const renvoyes = P.selection.slice();
  for (const c of renvoyes) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];
  P.rechargements -= 1;
  completer(P, rng);
  return { ok: true, renvoyes: renvoyes.length };
}

// La riposte, séparée de la volée : l'interface joue les deux tirs l'un APRÈS
// l'autre, et a besoin de savoir quoi montrer entre les deux.
export function riposter(P) {
  if (P.fini) return null;
  const prise = P.prise;
  const annonce = prise.annonce;
  const res = { intention: annonce, annulee: false, effets: [] };

  // SA CARTE NE TOUCHE PAS NOTRE COQUE — nous n'en avons pas — ELLE TOUCHE
  // NOTRE MAIN, ou le compteur. C'est là que se joue la rencontre : ce qu'elle
  // nous prend, ce sont des munitions et des coups.
  if (prise.tirAnnule) { res.annulee = true; res.raison = 'La mitraille a balayé son pont.'; }
  else {
    switch (annonce.effet) {
      case 'mouillage': {
        // Déterministe et annoncé : la lame noie la MEILLEURE munition en main.
        // Mouillée, sa poudre tombe à zéro jusqu'à la fin de la rencontre —
        // elle reste en main, et elle compte encore pour les figures.
        const cible = P.main.filter((c) => !estFeu(c) && !c.mouillee)
          .sort((a, b) => poudreDe(b, P) - poudreDe(a, P) || a.uid - b.uid)[0];
        if (cible) { cible.mouillee = true; res.effets.push(`${cible.nom} est mouillée — sa poudre ne prend plus.`); }
        else res.effets.push('Rien à mouiller.');
        break;
      }
      case 'brulot':
        // `push`, pas `unshift` : on pioche avec `pop()`, donc la fin du
        // tableau est le DESSUS du paquet. Mise en tête, la carte Feu partait
        // au fond de la pioche et n'arrivait jamais en main — l'effet le plus
        // visible de la prise était invisible.
        if (!P.reliques.includes('quille')) { P.pioche.push(feu()); res.effets.push(`${prise.nom} envoie un brûlot : une carte Feu au-dessus de ta pioche.`); }
        else res.effets.push('La quille carénée refuse le feu.');
        break;
      case 'grappin': {
        // Elle ne mouille pas : elle ARRACHE. La meilleure munition en main
        // repart au fond du paquet — elle reviendra, mais pas ce tour-ci.
        const cible = P.main.filter((c) => !estFeu(c))
          .sort((a, b) => poudreDe(b, P) - poudreDe(a, P) || a.uid - b.uid)[0];
        if (cible) {
          P.main.splice(P.main.indexOf(cible), 1);
          P.defausse.push(cible);
          res.effets.push(`${cible.nom} est arrachée du pont — elle repart au fond du paquet.`);
        } else res.effets.push('Le grappin ne mord sur rien.');
        break;
      }
      case 'manoeuvre':
        // Elle mord sur la RESSOURCE, pas sur la main : c'est le coup qui fait
        // le plus mal quand il reste peu de bordées.
        if (P.rechargements > 0) { P.rechargements -= 1; res.effets.push(`${prise.nom} gagne du temps : un rechargement de moins.`); }
        else res.effets.push('Plus un rechargement à lui prendre.');
        break;
      case 'colmatage':
        // Elle reprend du terrain sur le seul compteur qui décide.
        if (P.pression > 0) {
          const rendu = Math.min(P.pression, annonce.force || 12);
          P.pression -= rendu;
          res.effets.push(`${prise.nom} colmate : ${rendu} de pression perdue.`);
        } else res.effets.push('Rien à colmater.');
        break;
      default: break;
    }
  }

  // Le journal ne sert qu'au tour courant : on le vide une fois la riposte lue.
  P.journal = [];
  prise.tirAnnule = false;
  prise.i = (prise.i + 1) % prise.intentions.length;
  prise.annonce = prise.intentions[prise.i];
  // LE PILOTE VOIT PLUS LOIN : la carte d'après, annoncée elle aussi. Il
  // annulait le malus de météo, et la météo n'entre plus dans aucune règle.

  P.tour += 1;
  // Plus une bordée à tirer : la prise force de voiles et s'échappe. C'est la
  // seule fin qui ne rend rien, et la SEULE façon de perdre — on ne coule plus.
  if (!P.fini && P.bordees <= 0) denouement(P, 'echec');
  return res;
}

// Il n'y a plus de largage : le RECHARGEMENT en tient lieu, et il a un
// compteur écrit sur le ruban plutôt qu'un coût caché dans la relève.

// La meilleure volée jouable de la main. Sert à l'aide et — surtout — aux
// tests : si un joueur appliqué ne fait pas nettement mieux qu'un joueur qui
// jette ses cartes, le choix ne compte pas et la manche ne sert à rien.
export function meilleureVolee(P, { viser = 'degats', max = null } = {}) {
  const plafond = max == null ? voleeMax(P) : Math.min(max, voleeMax(P));
  const jouables = P.main.filter((c) => peutJouer(P, c).ok);
  const n = jouables.length;
  let best = null;
  for (let masque = 1; masque < (1 << n); masque++) {
    const cartes = [];
    for (let i = 0; i < n; i++) if (masque & (1 << i)) cartes.push(jouables[i]);
    if (cartes.length > plafond) continue;
    const r = evaluer(P, cartes);
    // `viser` dit ce qu'on cherche : la pression brute, ou l'annulation de la
    // carte annoncée. Les deux ne donnent pas la même volée — c'est justement
    // ce qui fait qu'il y a un choix.
    const note = viser === 'annule' ? (r.annule ? 1000 + r.pression : -1) : r.pression;
    if (!best || note > best.note) best = { ...r, cartes, note };
  }
  return best;
}

// ON RECRUTE AU PORT, et il n'y a plus qu'une sorte de recrutement : les
// hommes de l'état-major remplacent à la fois les recrues (qui entraient dans
// le deck) et les officiers (qui n'y entraient pas). Deux façons de payer pour
// deux sortes d'hommes, c'était une distinction que l'écran ne montrait pas.
export const engagerHomme = (P, def) => {
  if (P.butin < def.prix) return { ok: false, pourquoi: 'Pas assez de butin.' };
  if (P.hommes.includes(def.id)) return { ok: false, pourquoi: 'Déjà à bord.' };
  if (P.hommes.length >= ETAT_MAJOR_MAX) return { ok: false, pourquoi: `Cinq hommes au plus à l'état-major.` };
  P.butin -= def.prix; P.hommes.push(def.id); return { ok: true };
};
export const acheterRelique = (P, def) => {
  if (P.butin < def.prix) return { ok: false, pourquoi: 'Pas assez de butin.' };
  if (P.reliques.includes(def.id)) return { ok: false, pourquoi: 'Déjà à bord.' };
  P.butin -= def.prix; P.reliques.push(def.id); return { ok: true };
};

// LA PROMOTION EST SUPPRIMÉE avec les valeurs individuelles : une munition ne
// se gradue pas, et toutes celles du même nom valent la même chose. C'est ce
// qui permet aux figures d'exister.
