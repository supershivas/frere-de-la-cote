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

export const MAIN_MAX = 5;
export const SEUIL_GREEMENT = 26;   // en dessous, le tir passe dans les voiles

const FEU = { id: 'feu', nom: 'Feu', role: 'feu', quart: null, valeur: 0 };
export const estFeu = (c) => c.role === 'feu';

export const bordDe = (contenu, c) => (estFeu(c) ? null : contenu.quarts[c.quart].bord);
export const boutDe = (contenu, c) => (estFeu(c) ? null : contenu.quarts[c.quart].bout);
export const autreBord = (b) => (b === 'babord' ? 'tribord' : 'babord');

export function valeur(c) {
  if (estFeu(c)) return 0;
  return Math.max(0, (c.valeur || 0) + (c.grade || 0) - 2 * (c.blesse ? 1 : 0));
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
export function evaluer(P, cartes) {
  const contenu = P.contenu;
  const hommes = cartes.filter((c) => !estFeu(c));
  const lignes = [];
  const cible = visee(P, cartes);
  const prise = P.prise;
  const bas = prise ? prise.pv <= prise.max * (P.reliques.includes('grappins') ? 0.7 : 0.5) : false;

  // LE CHARPENTIER TRAVAILLE SEUL. Une volée d'un seul charpentier répare ;
  // accompagné, il n'est qu'un homme de plus qui ne tire pas. Sans cette
  // exclusivité il se glissait dans presque chaque volée sans rien coûter, et
  // rendait autant de coque que la prise en enlevait : le combat ne finissait
  // plus, et un joueur qui ne choisissait rien survivait aussi bien qu'un
  // joueur qui choisissait.
  const repare = (cartes.length === 1 && hommes.length === 1 && hommes[0].role === 'charpentier') ? 1 : 0;
  const synergies = [];

  const canonniers = repare ? [] : hommes.filter((c) => c.role === 'canonnier');
  const meilleurCanon = canonniers.length ? Math.max(...canonniers.map(valeur)) : 0;

  let total = 0;
  if (repare) {
    for (const c of cartes) {
      lignes.push({ quoi: estFeu(c) ? 'Feu' : c.nom, note: estFeu(c) ? 'jeté par-dessus bord' : 'au radoub', points: 0 });
    }
    lignes.push({ quoi: 'Radoub', note: '+12 à La Tortue, +1 largage, un Feu jeté', points: 0 });
    return { cible: 'radoub', lignes, synergies: ['Radoub'], total: 0, degats: 0, abat: false, repare, bord: bordDeLaVolee(P, cartes) };
  }
  for (const c of cartes) {
    if (estFeu(c)) { lignes.push({ quoi: 'Feu', note: 'encombre la volée', points: 0 }); continue; }
    const v = valeur(c);
    if (c.role === 'charpentier') { lignes.push({ quoi: c.nom, note: 'ne tire pas — il ne répare que seul', points: 0 }); continue; }
    if (c.role === 'gabier') {
      const g = meilleurCanon || v;
      lignes.push({ quoi: c.nom, note: meilleurCanon ? 'réglage de tir' : 'sans canonnier, il ne règle rien', points: g });
      total += g; continue;
    }
    if (c.role === 'abordeur') {
      const g = bas ? v * 2 : v;
      lignes.push({ quoi: c.nom, note: bas ? 'à l’abordage, compte double' : 'attend que la coque cède', points: g });
      total += g; continue;
    }
    lignes.push({ quoi: c.nom, note: null, points: v });
    total += v;
  }

  if (canonniers.length >= 3) { synergies.push('Bordée pleine'); lignes.push({ quoi: 'Bordée pleine', note: 'trois canonniers', points: 24 }); total += 24; }
  else if (canonniers.length >= 2) { synergies.push('Bordée'); lignes.push({ quoi: 'Bordée', note: 'deux canonniers', points: 10 }); total += 10; }
  if (hommes.filter((c) => c.role === 'abordeur').length >= 2 && bas) {
    synergies.push('Abordage'); lignes.push({ quoi: 'Abordage', note: 'deux abordeurs sur une coque basse', points: 14 }); total += 14;
  }
  if (P.reliques.includes('caronades')) { lignes.push({ quoi: 'Caronades', note: null, points: 4 }); total += 4; }

  const mm = P.meteo && P.meteo.mods ? (P.meteo.mods.damageMult || 1) : 1;
  if (mm !== 1) {
    const avant = total;
    total = Math.round(total * mm);
    lignes.push({ quoi: P.meteo.name_fr, note: mm < 1 ? 'la mer gêne le pointage' : 'la mer porte le tir', points: total - avant });
  }

  // Les règles de prise agissent sur le RÉSULTAT, pas sur le barème : elles
  // cassent une habitude pour un navire donné, elles ne réécrivent pas le jeu.
  const regle = prise ? prise.regle : null;
  if (regle === 'lest' && hommes.length < 3) {
    lignes.push({ quoi: 'Lourdement lestée', note: 'moins de trois hommes ne l’entament pas', points: -total });
    total = 0;
  }
  if (regle === 'cuirasse' && total > 0) {
    const perdu = Math.min(10, total);
    lignes.push({ quoi: 'Bordé doublé', note: 'les dix premiers points ne portent pas', points: -perdu });
    total -= perdu;
  }

  if (regle === 'franc_bord' && cible === 'coque' && total > 0) {
    const perdu = Math.round(total * 0.3);
    lignes.push({ quoi: 'Franc-bord haut', note: 'sa muraille encaisse le tiers', points: -perdu });
    total -= perdu;
  }

  const abat = cible === 'greement'
    && (total >= SEUIL_GREEMENT || P.reliques.includes('hune'))
    && prise && prise.mats > 0;

  return {
    cible, lignes, synergies,
    total,
    degats: cible === 'coque' ? total : 0,
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
    reliques: [], butin: 0, prisesFaites: 0,
    nous: { pv: contenu.tortue.pv, max: contenu.tortue.pv },
    prise: null,
    encrasse: null, encrasseTours: 0,
    pioche: [], main: [], defausse: [], selection: [],
    largages: 2, meteo: null, fini: null, journal: [], tour: 1,
  };
}

export const tailleMain = (P) => 7 + (P.reliques.includes('longue_vue') ? 1 : 0);

// LA RELÈVE : on ne remplit pas la main, on relève TROIS hommes par tour.
//
// C'est la seule chose qui fasse du choix un choix. Tant que la main se
// remplissait à ras bord entre deux volées, jouer cinq cartes était toujours
// la meilleure réponse et il n'y avait rien à décider : mesuré, un joueur qui
// prenait les cinq premières cartes jouables gagnait aussi souvent qu'un
// joueur qui cherchait la meilleure volée. Avec une relève de trois, brûler
// cinq hommes maintenant, c'est tirer à deux le tour prochain.
export const RELEVE = 3;

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
    intentions: ints, i: 0, annonce: ints[0], tirAnnule: false, regreement: 0,
  };
  P.meteo = meteo || null;
  P.nous.pv = P.nous.max;
  P.largages = 2 + (P.reliques.includes('seaux') ? 1 : 0);
  P.encrasse = null; P.encrasseTours = 0;
  P.tour = 1;
  P.pioche = melanger(P.equipage, rng);
  for (const c of P.equipage) c.blesse = false;
  P.main = []; P.defausse = []; P.selection = [];
  P.fini = null; P.journal = [];
  completer(P, rng, tailleMain(P));
  return true;
}

// `combien` : la relève ordinaire vaut RELEVE ; l'engagement remplit la main.
export function completer(P, rng, combien = RELEVE) {
  const cible = Math.min(tailleMain(P), P.main.length + combien);
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
  if (P.encrasse === b) return { ok: false, pourquoi: `${P.contenu.bords[b].nom} recharge encore.` };
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
  const prise = P.prise;
  const evenements = [];

  if (r.degats > 0) { prise.pv = Math.max(0, prise.pv - r.degats); evenements.push({ type: 'coque', degats: r.degats }); }
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
    P.largages += repare;
    let jetes = 0;
    for (const zone of [P.main, P.pioche, P.defausse]) {
      while (jetes < repare) { const i = zone.findIndex(estFeu); if (i < 0) break; zone.splice(i, 1); jetes += 1; }
    }
    P.journal.push(`Radoub : +${12 * repare} à La Tortue, +${repare} largage${repare > 1 ? 's' : ''}${jetes ? `, ${jetes} Feu jeté` : ''}`);
  }

  // Le bord qui vient de tirer encrasse. C'est le seul « coût » du tour, et il
  // force l'alternance : sans lui, une seule bonne moitié du jeu suffirait.
  if (r.bord) { P.encrasse = r.bord; P.encrasseTours = P.reliques.includes('ecouvillons') ? 0 : 1; }

  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];

  if (prise.pv <= 0) { P.fini = 'prise'; P.butin += prise.butin; P.prisesFaites += 1; }
  return { ...r, evenements };
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
          .sort((a, b) => valeur(b) - valeur(a) || a.uid - b.uid)[0];
        if (cible) { cible.blesse = true; res.effets.push(`${cible.nom} est blessé — −2`); }
        else res.effets.push('Personne à blesser.');
        break;
      }
      case 'brulot':
        if (!P.reliques.includes('quille')) { P.pioche.unshift(feu()); res.effets.push('Une carte Feu entre dans ta pioche.'); }
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
  return res;
}

export function largage(P) {
  if (P.fini || !P.selection.length) return { ok: false, pourquoi: 'Rien de sélectionné.' };
  if (P.largages <= 0) return { ok: false, pourquoi: 'Plus de largage.' };
  P.largages -= 1;
  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];
  return { ok: true };
}

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
    const note = viser === 'greement' && r.abat ? 1000 + r.total : r.degats;
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
export const graduer = (P, c, prix = 4) => {
  if (P.butin < prix) return { ok: false, pourquoi: 'Pas assez de butin.' };
  if (estFeu(c) || c.grade >= 3) return { ok: false, pourquoi: 'Rien à promouvoir.' };
  P.butin -= prix; c.grade += 1; return { ok: true };
};
