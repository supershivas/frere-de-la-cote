// La chasse-partie en cartes — les règles.
//
// LE TOUR : on choisit des hommes dans sa main, ils tirent, la prise riposte
// avec le coup qu'elle a ANNONCÉ au tour précédent. Rien n'est caché, rien
// n'est tiré au dé : un tour est un problème fermé.
//
// LES DEUX AXES, et ce qu'ils veulent dire :
//
//   LE BORD (bâbord / tribord) dit AVEC QUI un homme peut tirer. Une volée ne
//   mêle pas les deux bords — les canons d'un même bord tirent ensemble, ceux
//   d'en face regardent la mer. Et le bord qui vient de tirer ENCRASSE : il
//   faut alterner. C'est le verbe du jeu, et c'est ce qui empêche de rejouer
//   la même main deux fois.
//
//   LA RÉSISTANCE. Une prise annonce AVANT l'engagement la PRESSION qu'il
//   faut lui mettre pour qu'elle amène son pavillon. C'est un seuil, comme
//   une ante : on a QUATRE bordées pour l'atteindre, et trois rechargements
//   pour améliorer sa main sans tirer. La rareté n'est plus dans la relève,
//   elle est dans le nombre de coups — quatre volées pour 210 points de
//   pression, ce n'est pas la même main que quatre volées pour 90.
//
//   L'AVANT / L'ARRIÈRE dit SUR QUOI on tire. Une volée à dominante arrière
//   frappe la coque : ce sont les dégâts. Une volée à dominante avant monte
//   dans le gréement : elle n'entame pas la coque, elle ABAT UN MÂT — et un
//   mât abattu annule le coup que la prise avait annoncé. Démâtée, elle ne
//   riposte plus du tout.
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
export const SEUIL_GREEMENT = 26;   // en dessous, le tir passe dans les voiles
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

const FEU = { id: 'feu', nom: 'Feu', role: 'feu', quart: null, valeur: 0 };
export const estFeu = (c) => c.role === 'feu';

export const bordDe = (contenu, c) => (estFeu(c) ? null : contenu.quarts[c.quart].bord);
export const boutDe = (contenu, c) => (estFeu(c) ? null : contenu.quarts[c.quart].bout);
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

// Où la volée porte. Tirer au gréement demande DEUX choses ensemble : que
// TOUS les hommes soient à l'avant, et qu'un gabier soit du nombre — seul un
// homme qui a couru les vergues sait pointer un canon en l'air.
//
// La condition a été « la majorité à l'avant » pendant une version, et c'était
// un défaut grave : une main jouée au hasard tirait au gréement une fois sur
// deux, annulait le coup annoncé sans l'avoir voulu, et affaiblissait la prise
// pour deux tours. Mesuré : un joueur qui ne choisissait rien gagnait plus
// souvent qu'un joueur qui lisait sa main. Un coup aussi fort doit se
// construire, pas se rencontrer.
export function visee(P, cartes) {
  const hommes = cartes.filter((c) => !estFeu(c));
  if (!hommes.length) return 'coque';
  // L'ABORDAGE : deux abordeurs, sur une coque déjà basse. On saute à bord —
  // les dégâts portent, et c'est ce qui pousse le plus fort du jeu.
  const prise = P.prise;
  const bas = prise && prise.pv <= prise.max * (P.reliques.includes('grappins') ? 0.7 : SEUIL_ABORDAGE);
  if (bas && hommes.filter((c) => c.role === 'abordeur').length >= 2) return 'abordage';
  const tousAvant = hommes.every((c) => boutDe(P.contenu, c) === 'avant');
  const gabier = hommes.some((c) => c.role === 'gabier');
  return tousAvant && gabier ? 'greement' : 'coque';
}

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
      poudre: 0, fureur: 1, total: 0, pression: 0, degats: 0, abat: false, repare,
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
  if (aOfficier(P, 'aumonier') && hommes.length >= 3) { synergies.push('Plein équipage'); ajoute(0.5, 'L’Aumônier', 'trois hommes à la manœuvre'); }

  // LA MULTIPLICATION, UNE SEULE FOIS. Les fureurs se sont additionnées entre
  // elles ; c'est leur somme qui porte la poudre.
  let total = Math.round(poudre * fureur);

  /* --- ce qui arrive au boulet une fois parti --------------------------- */
  let mm = P.meteo && P.meteo.mods ? (P.meteo.mods.damageMult || 1) : 1;
  if (mm < 1 && aOfficier(P, 'pilote')) mm = 1;
  if (mm !== 1) {
    const avant = total;
    total = Math.round(total * mm);
    lignes.push({ quoi: P.meteo.name_fr, note: mm < 1 ? 'la mer gêne le pointage' : 'la mer porte le tir', total: total - avant });
  }

  // Les règles de prise agissent sur le RÉSULTAT, pas sur le barème : elles
  // cassent une habitude pour un navire donné, elles ne réécrivent pas le jeu.
  const regle = prise ? prise.regle : null;
  // Le seuil suit la taille des volées : écrit « moins de trois » quand on
  // jouait jusqu'à cinq hommes, il annulait presque toutes les volées une fois
  // le plafond descendu à trois.
  if (regle === 'lest' && hommes.length < 2) {
    lignes.push({ quoi: 'Lourdement lestée', note: 'un homme seul ne l’entame pas', total: -total });
    total = 0;
  }
  if (regle === 'cuirasse' && total > 0) {
    const perdu = Math.min(10, total);
    lignes.push({ quoi: 'Bordé doublé', note: 'les dix premiers points ne portent pas', total: -perdu });
    total -= perdu;
  }
  if (regle === 'franc_bord' && cible === 'coque' && total > 0) {
    const perdu = Math.round(total * 0.3);
    lignes.push({ quoi: 'Franc-bord haut', note: 'sa muraille encaisse le tiers', total: -perdu });
    total -= perdu;
  }

  const seuil = aOfficier(P, 'maitre_voilier') ? 20 : SEUIL_GREEMENT;
  const abat = cible === 'greement'
    && (total >= seuil || P.reliques.includes('hune'))
    && prise && prise.mats > 0;

  // TOUTE volée met de la PRESSION, quelle que soit sa cible : c'est le seul
  // compteur qui décide de la fin. Seules la coque et l'abordage entament en
  // plus le bordé — tirer au gréement pousse autant et n'abîme rien.
  return {
    cible, lignes, synergies,
    poudre, fureur, total, seuil,
    pression: total,
    degats: cible === 'coque' || cible === 'abordage' ? total : 0,
    abat,
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
    nous: { pv: contenu.tortue.pv, max: contenu.tortue.pv },
    prise: null,
    encrasse: null, encrasseTours: 0,
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
    mats: defPrise.mats, matsMax: defPrise.mats,
    resistance: defPrise.resistance,
    intentions: ints, i: 0, annonce: ints[0], tirAnnule: false, regreement: 0,
  };
  // Les deux compteurs de la rencontre, annoncés avant qu'on engage.
  P.pression = 0;
  P.bordees = bordeesDe(P);
  P.rechargements = rechargementsDe(P);
  P.meteo = meteo || null;
  P.nous.pv = P.nous.max;
  P.encrasse = null; P.encrasseTours = 0;
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
  // SOUPAPE : si aucun homme du bord libre n'est en main, le bord encrassé
  // reprend le service. Sans elle, une main de cinq cartes toutes du même bord
  // laissait le joueur sans le moindre coup à jouer — mesuré, c'était une
  // majorité de tours perdus, et un tour perdu n'est pas une décision.
  const secours = P.encrasse === b
    && !P.main.some((x) => !estFeu(x) && bordDe(P.contenu, x) !== P.encrasse);
  if (P.encrasse === b && !secours) return { ok: false, pourquoi: `${P.contenu.bords[b].nom} recharge encore.` };
  const bv = bordDeLaVolee(P, P.selection);
  if (bv && bv !== b) return { ok: false, pourquoi: `La volée est à ${P.contenu.bords[bv].nom} : les canons d’en face ne portent pas.` };
  return { ok: true };
}

export function selectionner(P, c) {
  const i = P.selection.indexOf(c);
  if (i >= 0) { P.selection.splice(i, 1); return { ok: true }; }
  if (P.selection.length >= MAIN_MAX) return { ok: false, pourquoi: 'Cinq hommes au plus dans une volée.' };
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
  if (r.cible === 'greement') {
    if (r.abat) {
      prise.mats -= 1;
      prise.regreement = 2;
      // Un mât abattu emporte le coup ANNONCÉ, et rien de plus : c'est un
      // répit, pas un interrupteur. Il se regrée en deux tours. Rendu
      // définitif, il devenait la seule tactique du jeu — y compris pour un
      // joueur qui l'atteignait par accident.
      if (prise.regle !== 'riposte') prise.tirAnnule = true;
      evenements.push({ type: 'mat', restants: prise.mats });
      P.journal.push(`Un mât tombe — ${prise.nom} ne tirera pas ce tour-ci.`);
    } else {
      evenements.push({ type: 'rate' });
      P.journal.push('Le tir passe dans les voiles sans rien casser.');
    }
  }

  const repare = r.repare || 0;
  if (repare) {
    P.nous.pv = Math.min(P.nous.max, P.nous.pv + 12 * repare);
    let jetes = 0;
    for (const zone of [P.main, P.pioche, P.defausse]) {
      while (jetes < repare) { const i = zone.findIndex(estFeu); if (i < 0) break; zone.splice(i, 1); jetes += 1; }
    }
    P.journal.push(`Radoub : +${12 * repare} à La Tortue${jetes ? `, ${jetes} Feu jeté` : ''}`);
  }

  // Le bord qui vient de tirer encrasse — mais SEULEMENT s'ils étaient
  // plusieurs. Un homme seul recharge son canon à temps. C'est la porte de
  // sortie du joueur coincé, et surtout une décision de plus : une grosse
  // volée maintenant contre le choix du bord au tour suivant.
  const nbHommes = joues.filter((c) => !estFeu(c)).length;
  if (r.bord && nbHommes >= 2) { P.encrasse = r.bord; P.encrasseTours = P.reliques.includes('ecouvillons') ? 0 : 1; }
  else if (nbHommes < 2) { P.encrasse = null; P.encrasseTours = 0; }

  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];

  if (r.cible === 'abordage') prise.abordee = true;

  // LES TROIS FINS. On regarde la PRESSION d'abord : une prise qui amène son
  // pavillon se rend entière, même si le même boulet l'aurait envoyée par le
  // fond. Coulée, on ne repêche que ce qui flotte.
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
  const res = { intention: annonce, annulee: false, degats: 0, effets: [] };

  if (prise.tirAnnule) { res.annulee = true; res.raison = 'Le mât abattu emporte son tir.'; }
  else {
    switch (annonce.effet) {
      case 'canon': {
        // Une prise qui a perdu du gréement tire moins fort : elle tient mal
        // sa position. Le tir au gréement paie donc encore après le tour où il
        // est passé, sans jamais la museler tout à fait.
        const greement = 0.5 + 0.5 * (prise.mats / prise.matsMax);
        res.degats = Math.round(prise.riposte * annonce.force * greement);
        P.nous.pv = Math.max(0, P.nous.pv - res.degats);
        break;
      }
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
      case 'virement':
        P.encrasse = P.encrasse ? autreBord(P.encrasse) : null;
        res.effets.push(P.encrasse ? `C'est ${P.contenu.bords[P.encrasse].nom} qui recharge.` : 'Rien à virer.');
        break;
      case 'radoub':
        prise.pv = Math.min(prise.max, prise.pv + Math.round(prise.max * 0.06));
        res.effets.push(`${prise.nom} colmate.`);
        break;
      default: break;
    }
  }

  // Le journal ne sert qu'au tour courant : on le vide une fois la riposte lue.
  P.journal = [];
  prise.tirAnnule = false;
  if (prise.mats < prise.matsMax) {
    prise.regreement -= 1;
    if (prise.regreement <= 0) { prise.mats += 1; prise.regreement = 2; res.effets.push(`${prise.nom} regrée un mât.`); }
  }
  prise.i = (prise.i + 1) % prise.intentions.length;
  prise.annonce = prise.intentions[prise.i];
  if (P.encrasseTours > 0) P.encrasseTours -= 1; else P.encrasse = null;
  P.tour += 1;
  if (P.nous.pv <= 0) P.fini = 'naufrage';
  // Plus une bordée à tirer : la prise force de voiles et s'échappe. C'est la
  // seule fin qui ne rend rien — d'où le prix d'un rechargement mal dépensé.
  else if (!P.fini && P.bordees <= 0) denouement(P, 'echec');
  return res;
}

// Il n'y a plus de largage : le RECHARGEMENT en tient lieu, et il a un
// compteur écrit sur le ruban plutôt qu'un coût caché dans la relève.

// La meilleure volée jouable de la main. Sert à l'aide et — surtout — aux
// tests : si un joueur appliqué ne fait pas nettement mieux qu'un joueur qui
// jette ses cartes, le choix ne compte pas et la manche ne sert à rien.
export function meilleureVolee(P, { viser = 'degats', max = MAIN_MAX } = {}) {
  const jouables = P.main.filter((c) => peutJouer(P, c).ok);
  const n = jouables.length;
  let best = null;
  for (let masque = 1; masque < (1 << n); masque++) {
    const cartes = [];
    for (let i = 0; i < n; i++) if (masque & (1 << i)) cartes.push(jouables[i]);
    if (cartes.length > Math.min(max, MAIN_MAX)) continue;
    const bords = new Set(cartes.filter((c) => !estFeu(c)).map((c) => bordDe(P.contenu, c)));
    if (bords.size > 1) continue;
    const r = evaluer(P, cartes);
    // `viser` dit ce qu'on cherche : les dégâts bruts, un mât, ou la prise la
    // moins abîmée. Les trois ne donnent pas la même volée — c'est justement
    // ce qui fait qu'il y a un choix.
    const note = viser === 'greement' ? (r.abat ? 1000 + r.total : -1)
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
