// La chasse-partie en cartes — les règles.
//
// LE TOUR : on choisit des hommes dans sa main, ils tirent, la prise riposte
// avec le coup qu'elle a ANNONCÉ au tour précédent. Rien n'est caché, rien
// n'est tiré au dé : un tour est un problème fermé.
//
// CE QUI FAIT LE JEU, ET RIEN D'AUTRE :
//
//   LE BORD (bâbord / tribord) dit AVEC QUI un homme peut tirer. Une volée ne
//   mêle pas les deux bords — les canons d'un même bord tirent ensemble, ceux
//   d'en face regardent la mer. C'est la seule contrainte de composition, et
//   elle suffit.
//
//   LA RÉSISTANCE. Une prise annonce AVANT l'engagement la PRESSION qu'il
//   faut lui mettre pour qu'elle amène son pavillon. C'est un seuil, comme
//   une ante : on a QUATRE bordées pour l'atteindre, et trois rechargements
//   pour améliorer sa main sans tirer. On ne perd pas en coulant — on n'a plus
//   de coque — on perd en MANQUANT le seuil.
//
//   LE GABIER ANNULE. La carte que la prise a annoncée ne tombe pas si un
//   gabier est de la volée. C'est tout ce qui reste du gréement, et c'est
//   assez : la prise annonce, on décide si l'on paie une place de volée pour
//   l'empêcher.
//
// CE QUI A ÉTÉ RETIRÉ, et qu'il ne faut pas reconstruire : l'avant et
// l'arrière (un homme n'a plus qu'un bord), les mâts et le démâtage,
// l'encrassement des bords, la météo en combat (elle reste le décor du ciel),
// les règles de prise, les points de vie de La Tortue et la riposte chiffrée.
// Chacun était un système de plus à tenir en tête devant un écran de 375 px.
// La variété doit venir des OFFICIERS et des RELIQUES, pas des règles de base.
//
// Pas de multiplicateur global : une volée rend UN chiffre, et le détail dit
// d'où vient chaque point.
//
// RÈGLE 1 DU DÉPÔT : aucune entropie ici — pas de tirage, pas d'horloge, pas
// de source cryptographique. Le battage prend un `rng` en argument parce qu'il
// relève de la GÉNÉRATION ; la résolution n'en prend jamais. La mitraille vise
// le meilleur homme en main, pas un homme au hasard : c'est prévisible, donc
// c'est jouable.
//
// RÈGLE 5 : un ordre impossible rend un refus MOTIVÉ (`{ ok: false, pourquoi }`),
// jamais un silence.

// Trois hommes au plus dans une volée, cinq en main. Des cartes plus grandes
// se lisent au pouce ; sept qui se partagent 375 px ne se lisent pas.
export const MAIN_MAX = 3;
// Les écouvillons achètent une PLACE DE PLUS dans la volée. Ils dégageaient un
// bord encrassé, et l'encrassement n'existe plus : un objet qui ne change
// aucune règle n'est qu'un texte.
export const voleeMax = (P) => MAIN_MAX + (P.reliques.includes('ecouvillons') ? 1 : 0);
export const SEUIL_ABORDAGE = 0.5;  // sous cette part de coque, on peut sauter à bord

// LA RENCONTRE EST UNE ANTE : quatre bordées pour atteindre la résistance de
// la prise, trois rechargements pour se refaire une main entre deux. Ces deux
// chiffres SONT le jeu — c'est d'eux que vient la rareté, et c'est pour ça
// qu'ils sont écrits ici et pas dans les données.
export const BORDEES = 4;
export const RECHARGEMENTS = 3;

// Deux verbes qui vivaient dans la relève et n'auraient eu nulle part où
// aller sans elle : ils achètent maintenant des COUPS, la seule ressource de
// la rencontre. Un objet qui ne change plus aucune règle n'est qu'un texte.
export const bordeesDe = (P) => BORDEES + (P.reliques.includes('double_fond') ? 1 : 0);
export const rechargementsDe = (P) => RECHARGEMENTS + (aOfficier(P, 'quartier_maitre') ? 1 : 0);

const FEU = { id: 'feu', nom: 'Feu', role: 'feu', bord: null, valeur: 0 };
export const estFeu = (c) => c.role === 'feu';

// UN HOMME N'A PLUS QU'UN BORD. Il avait un « quart » — un bord ET un bout,
// avant ou arrière — et le bout servait à viser le gréement. Le gréement est
// devenu l'affaire du gabier seul ; il ne restait du quart qu'une moitié.
// `contenu` reste en premier argument : tout le jeu appelle `bordDe(P.contenu, c)`.
export const bordDe = (contenu, c) => (estFeu(c) ? null : c.bord);
export const autreBord = (b) => (b === 'babord' ? 'tribord' : 'babord');

// LES OFFICIERS sont les jokers de la chasse-partie : ils ne se jouent pas,
// ils sont là et ils changent une règle. Leur nom, leur texte et leur prix
// sont du contenu (`data/equipage.json`) ; leur VERBE est une règle, donc il
// vit ici. C'est la seule chose du jeu qui demande une ligne de code pour être
// ajoutée, et c'est voulu : un officier qui ne changerait aucune règle ne
// serait qu'un homme de plus.
export const aOfficier = (P, id) => P.officiers.includes(id);
export const OFFICIERS_MAX = 3;

export function valeur(c, P = null) {
  if (estFeu(c)) return 0;
  const malus = c.blesse ? (P && aOfficier(P, 'chirurgien') ? 1 : 2) : 0;
  return Math.max(0, (c.valeur || 0) + (c.grade || 0) - malus);
}

/* ------------------------------------------------------------ la volée */

// Où la volée porte. Il ne reste que deux façons : au canon, dans la coque, ou
// à l'abordage quand deux abordeurs trouvent une coque déjà basse. Le tir au
// gréement n'est plus une visée — c'est la seule présence d'un gabier, et elle
// ne change pas où la volée porte, elle empêche la carte annoncée de tomber.
export function visee(P, cartes) {
  const hommes = cartes.filter((c) => !estFeu(c));
  if (!hommes.length) return 'coque';
  const prise = P.prise;
  const bas = prise && prise.pv <= prise.max * (P.reliques.includes('grappins') ? 0.7 : SEUIL_ABORDAGE);
  if (bas && hommes.filter((c) => c.role === 'abordeur').length >= 2) return 'abordage';
  return 'coque';
}

// LE GABIER ANNULE LA CARTE ANNONCÉE. C'est le seul usage du gréement, et il
// n'a plus ni seuil de puissance ni mât à faire tomber : il est là ou il n'y
// est pas. Un coup fort doit se construire — ici, il coûte une des trois
// places de la volée, et c'est tout le prix.
export const annuleLAnnonce = (P, cartes) =>
  cartes.some((c) => !estFeu(c) && c.role === 'gabier');

export function bordDeLaVolee(P, cartes) {

  for (const c of cartes) if (!estFeu(c)) return bordDe(P.contenu, c);
  return null;
}

// Le compte complet d'une volée : le total ET d'où vient chaque point. Le
// détail n'est pas décoratif — c'est ce qui rend le tour lisible avant qu'on
// le joue.
// LE COMPTE D'UNE VOLÉE, SUR DEUX AXES.
//
//   LA POUDRE, c'est ce que les hommes valent : la somme de leurs valeurs.
//   LA FUREUR, c'est ce que leur entente vaut : elle part à 1, chaque synergie
//   en ajoute, TOUTES LES FUREURS S'ADDITIONNENT, et la somme multiplie la
//   poudre UNE SEULE FOIS.
//
//     total = poudre × fureur
//
// Deux axes plutôt qu'un seul tas de points, parce qu'ils ne se remplacent pas :
// trois bons canonniers sans entente font une grosse poudre et une petite
// fureur ; une volée bien assortie d'hommes médiocres fait l'inverse. Le
// joueur voit ce qu'il construit, et le détail dit de quel côté vient chaque
// gain — d'où les lignes qui portent l'un OU l'autre.
//
// La météo et les règles de prise, elles, agissent sur le RÉSULTAT, après la
// multiplication : elles ne changent ni ce que valent les hommes ni ce que
// vaut leur entente, elles disent ce qui arrive au boulet une fois parti.
export function evaluer(P, cartes) {
  const hommes = cartes.filter((c) => !estFeu(c));
  const lignes = [];
  const cible = visee(P, cartes);
  const prise = P.prise;
  const bas = prise ? prise.pv <= prise.max * (P.reliques.includes('grappins') ? 0.7 : SEUIL_ABORDAGE) : false;

  // LE CHARPENTIER TRAVAILLE SEUL. Une volée d'un seul charpentier répare ;
  // accompagné, il n'est qu'un homme de plus qui ne tire pas. Sans cette
  // exclusivité il se glissait dans presque chaque volée sans rien coûter, et
  // rendait autant de coque que la prise en enlevait : le combat ne finissait
  // plus, et un joueur qui ne choisissait rien survivait aussi bien qu'un
  // joueur qui choisissait.
  const repare = (cartes.length === 1 && hommes.length === 1 && hommes[0].role === 'charpentier') ? 1 : 0;
  const synergies = [];

  const canonniers = repare ? [] : hommes.filter((c) => c.role === 'canonnier');
  const gabiers = repare ? [] : hommes.filter((c) => c.role === 'gabier');
  const meilleurCanon = canonniers.length ? Math.max(...canonniers.map((c) => valeur(c, P))) : 0;

  if (repare) {
    for (const c of cartes) {
      lignes.push({ quoi: estFeu(c) ? 'Feu' : c.nom, note: estFeu(c) ? 'jeté par-dessus bord' : 'au radoub', poudre: 0 });
    }
    lignes.push({ quoi: 'Radoub', note: '+12 à La Tortue, un Feu jeté', poudre: 0 });
    return {
      cible: 'radoub', lignes, synergies: ['Radoub'],
      poudre: 0, fureur: 1, total: 0, pression: 0, degats: 0, annule: false, repare,
      bord: bordDeLaVolee(P, cartes),
    };
  }

  /* --- LA POUDRE : ce que les hommes valent ----------------------------- */
  let poudre = 0;
  for (const c of cartes) {
    if (estFeu(c)) { lignes.push({ quoi: 'Feu', note: 'encombre la volée', poudre: 0 }); continue; }
    const v = valeur(c, P);
    if (c.role === 'charpentier') { lignes.push({ quoi: c.nom, note: 'ne tire pas — il ne répare que seul', poudre: 0 }); continue; }
    if (c.role === 'gabier') {
      const g = meilleurCanon || v;
      lignes.push({ quoi: c.nom, note: meilleurCanon ? 'réglage de tir' : 'sans canonnier, il ne règle rien', poudre: g });
      poudre += g; continue;
    }
    if (c.role === 'abordeur') {
      const g = bas ? v * 2 : v;
      lignes.push({ quoi: c.nom, note: bas ? 'à l’abordage, compte double' : 'attend que la coque cède', poudre: g });
      poudre += g; continue;
    }
    const bosco = aOfficier(P, 'bosco') ? 2 : 0;
    lignes.push({ quoi: c.nom, note: bosco ? 'le Bosco le pousse' : null, poudre: v + bosco });
    poudre += v + bosco;
  }
  if (P.reliques.includes('caronades')) { lignes.push({ quoi: 'Caronades', note: null, poudre: 6 }); poudre += 6; }

  /* --- LA FUREUR : ce que leur entente vaut ----------------------------- */
  let fureur = 1;
  const ajoute = (f, quoi, note) => { fureur += f; lignes.push({ quoi, note, fureur: f }); };

  const bordee = canonniers.length >= 2;
  if (canonniers.length >= 3) { synergies.push('Bordée pleine'); ajoute(2, 'Bordée pleine', 'trois canonniers'); }
  else if (bordee) { synergies.push('Bordée'); ajoute(1, 'Bordée', 'deux canonniers'); }
  if (gabiers.length && canonniers.length) { synergies.push('Réglage'); ajoute(0.5, 'Réglage', 'un gabier règle le tir'); }
  if (cible === 'abordage') { synergies.push('Abordage'); ajoute(1.5, 'Abordage', 'à bord — le pavillon tombe vite'); }
  if (bordee && aOfficier(P, 'maitre_canonnier')) ajoute(0.5, 'Le Maître canonnier', 'la bordée est tenue');
  // Le Maître voilier réglait le seuil du gréement, qui n'existe plus. Il paie
  // maintenant le gabier : couper la manœuvre adverse ne coûte plus une place
  // de volée pour rien.
  if (gabiers.length && aOfficier(P, 'maitre_voilier')) ajoute(0.5, 'Le Maître voilier', 'les gabiers sont dans les haubans');
  if (aOfficier(P, 'aumonier') && hommes.length >= 3) { synergies.push('Plein équipage'); ajoute(0.5, 'L’Aumônier', 'trois hommes à la manœuvre'); }

  // LA MULTIPLICATION, UNE SEULE FOIS. Les fureurs se sont additionnées entre
  // elles ; c'est leur somme qui porte la poudre.
  let total = Math.round(poudre * fureur);

  /* --- ce qui arrive au boulet une fois parti --------------------------- */
  // LA MÉTÉO NE TOUCHE PLUS LE TIR. Son `damageMult` multipliait chaque volée,
  // si bien qu'une même main valait deux chiffres différents selon le ciel et
  // qu'il fallait le lire avant de compter. Elle reste le DÉCOR — le ciel, la
  // houle, la pluie — et n'entre plus dans aucune règle.
  //
  // LES RÈGLES DE PRISE sont retirées elles aussi. `lest`, `cuirasse`,
  // `franc_bord` et `riposte` corrigeaient le total après coup, chacune à sa
  // façon : quatre exceptions à retenir pour cinq navires.

  // TOUTE volée met de la PRESSION, quelle que soit sa cible : c'est le seul
  // compteur qui décide de la fin. Seules la coque et l'abordage entament en
  // plus le bordé — tirer au gréement pousse autant et n'abîme rien.
  return {
    cible, lignes, synergies,
    poudre, fureur, total,
    pression: total,
    degats: total,
    // Le gabier annule la carte annoncée, quoi que la volée fasse par ailleurs.
    annule: annuleLAnnonce(P, cartes),
    bord: bordDeLaVolee(P, cartes),
  };
}

/* ------------------------------------------------------------ la partie */

let uid = 0;
const carte = (def) => ({ ...def, uid: ++uid, grade: 0, blesse: false });
const feu = () => carte(FEU);

export function melanger(liste, rng) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function nouvellePartie(contenu) {
  return {
    contenu,
    equipage: contenu.equipage.map(carte),
    reliques: [], officiers: [], butin: 0, prisesFaites: 0,
    // LA TORTUE N'A PLUS DE POINTS DE VIE. On ne perd plus en coulant : on
    // perd en manquant le seuil, et c'est la seule façon.
    prise: null,
    pioche: [], main: [], defausse: [], selection: [],
    meteo: null, fini: null, journal: [], tour: 1,
    pression: 0, bordees: BORDEES, rechargements: RECHARGEMENTS,
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
    // LE PILOTE VOIT PLUS LOIN : la carte d'après, annoncée elle aussi. Il
    // annulait le malus de météo, et la météo n'entre plus dans aucune règle.
    suivante: aOfficier(P, 'pilote') ? ints[1 % ints.length] : null,
  };
  // Les deux compteurs de la rencontre, annoncés avant qu'on engage.
  P.pression = 0;
  P.bordees = bordeesDe(P);
  P.rechargements = rechargementsDe(P);
  // La météo est passée en DÉCOR : on la garde sur la partie pour le ciel et
  // la houle, aucune règle ne la lit plus.
  P.meteo = meteo || null;
  P.tour = 1;
  P.pioche = melanger(P.equipage, rng);
  for (const c of P.equipage) c.blesse = false;
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
  const b = bordDe(P.contenu, c);
  // L'ENCRASSEMENT EST RETIRÉ. Le bord qui venait de tirer rechargeait un
  // tour, ce qui obligeait à alterner — et il fallait deux soupapes pour que
  // le joueur ne se retrouve pas sans un coup à jouer. Trois règles pour une
  // contrainte ; il ne reste que celle qui se voit : une volée d'un seul bord.
  const bv = bordDeLaVolee(P, P.selection);
  if (bv && bv !== b) return { ok: false, pourquoi: `La volée est à ${P.contenu.bords[bv].nom} : les canons d’en face ne portent pas.` };
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
  const joues = P.selection.slice();
  const prise = P.prise;
  const evenements = [];

  if (r.degats > 0) {
    prise.pv = Math.max(0, prise.pv - r.degats);
    evenements.push({ type: r.cible === 'abordage' ? 'abordage' : 'coque', degats: r.degats });
  }
  // LA PRESSION MONTE À CHAQUE VOLÉE, quelle qu'en soit la cible : c'est elle
  // que le joueur regarde, et c'est elle qui décide.
  P.pression += r.pression;
  P.bordees -= 1;

  // LE GABIER ANNULE LA CARTE ANNONCÉE. Il n'y a plus de mât à abattre ni de
  // seuil à franchir : il est de la volée ou il n'y est pas.
  if (r.annule) {
    prise.tirAnnule = true;
    evenements.push({ type: 'annule' });
    P.journal.push(`Les gabiers coupent son manœuvre — ${prise.nom} n’aura pas sa carte.`);
  }

  const repare = r.repare || 0;
  if (repare) {
    // LE CHARPENTIER NE SOIGNE PLUS UNE COQUE — on n'en a plus. Il nettoie la
    // main : les Feux passent par-dessus bord, et c'est le seul moyen d'en
    // sortir une fois qu'ils y sont.
    let jetes = 0;
    for (const zone of [P.main, P.pioche, P.defausse]) {
      while (jetes < repare * 2) { const i = zone.findIndex(estFeu); if (i < 0) break; zone.splice(i, 1); jetes += 1; }
    }
    P.journal.push(jetes ? `Au radoub : ${jetes} Feu jeté par-dessus bord.` : 'Au radoub : rien à jeter.');
  }

  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];

  if (r.cible === 'abordage') prise.abordee = true;

  // LES TROIS FINS. On regarde la PRESSION d'abord : une prise qui amène son
  // pavillon se rend entière, même si le même boulet l'aurait envoyée par le
  // fond. Coulée, on ne repêche que ce qui flotte. Et c'est SA coque à elle —
  // La Tortue n'a plus de points de vie, on ne perd plus en coulant.
  if (P.pression >= prise.resistance) denouement(P, 'prise');
  else if (prise.pv <= 0) denouement(P, 'coulee');
  return { ...r, evenements };
}

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

  // SA CARTE NE TOUCHE PLUS NOTRE COQUE — on n'en a plus — ELLE TOUCHE NOTRE
  // MAIN, ou le compteur. C'est là que se joue la rencontre : ce qu'elle nous
  // prend, ce sont des hommes et des coups, pas des points de vie.
  if (prise.tirAnnule) { res.annulee = true; res.raison = 'Les gabiers ont coupé sa manœuvre.'; }
  else {
    switch (annonce.effet) {
      case 'mitraille': {
        // Déterministe et annoncé : elle vise le meilleur homme en main.
        const cible = P.main.filter((c) => !estFeu(c) && !c.blesse)
          .sort((a, b) => valeur(b, P) - valeur(a, P) || a.uid - b.uid)[0];
        if (cible) { cible.blesse = true; res.effets.push(`${cible.nom} est blessé — −2`); }
        else res.effets.push('Personne à blesser.');
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
        // Elle ne blesse pas : elle RETIENT. Le meilleur homme en main repart
        // au fond du paquet, et la main se refera sans lui.
        const cible = P.main.filter((c) => !estFeu(c))
          .sort((a, b) => valeur(b, P) - valeur(a, P) || a.uid - b.uid)[0];
        if (cible) {
          P.main.splice(P.main.indexOf(cible), 1);
          P.defausse.push(cible);
          res.effets.push(`${cible.nom} est retenu à bord — il repart au fond du paquet.`);
        } else res.effets.push('Le grappin ne mord sur personne.');
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
  prise.suivante = aOfficier(P, 'pilote') ? prise.intentions[(prise.i + 1) % prise.intentions.length] : null;
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
    const bords = new Set(cartes.filter((c) => !estFeu(c)).map((c) => bordDe(P.contenu, c)));
    if (bords.size > 1) continue;
    const r = evaluer(P, cartes);
    // `viser` dit ce qu'on cherche : les dégâts bruts, un mât, ou la prise la
    // moins abîmée. Les trois ne donnent pas la même volée — c'est justement
    // ce qui fait qu'il y a un choix.
    const note = viser === 'annule' ? (r.annule ? 1000 + r.pression : -1)
      : viser === 'abordage' ? (r.cible === 'abordage' ? 1000 + r.pression : r.pression)
        // « butin » cherche la pression qui n'abîme pas : à pression égale,
        // celle qui laisse la coque entière et ne risque pas de la couler.
        : viser === 'butin' ? r.pression - r.degats * 0.5
          : r.pression;
    if (!best || note > best.note) best = { ...r, cartes, note };
  }
  return best;
}

export const recruter = (P, def) => {
  if (P.butin < def.prix) return { ok: false, pourquoi: 'Pas assez de butin.' };
  P.butin -= def.prix; P.equipage.push(carte(def)); return { ok: true };
};
export const acheterRelique = (P, def) => {
  if (P.butin < def.prix) return { ok: false, pourquoi: 'Pas assez de butin.' };
  if (P.reliques.includes(def.id)) return { ok: false, pourquoi: 'Déjà à bord.' };
  P.butin -= def.prix; P.reliques.push(def.id); return { ok: true };
};
export const engagerOfficier = (P, def) => {
  if (P.butin < def.prix) return { ok: false, pourquoi: 'Pas assez de butin.' };
  if (P.officiers.includes(def.id)) return { ok: false, pourquoi: 'Déjà à bord.' };
  if (P.officiers.length >= OFFICIERS_MAX) return { ok: false, pourquoi: `Trois officiers au plus à l'état-major.` };
  P.butin -= def.prix; P.officiers.push(def.id); return { ok: true };
};

export const graduer = (P, c, prix = 4) => {
  if (P.butin < prix) return { ok: false, pourquoi: 'Pas assez de butin.' };
  if (estFeu(c) || c.grade >= 3) return { ok: false, pourquoi: 'Rien à promouvoir.' };
  P.butin -= prix; c.grade += 1; return { ok: true };
};
