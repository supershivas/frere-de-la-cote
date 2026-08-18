// Proposition E — la chasse-partie en cartes.
//
// Le tour est un tour de Balatro : une main d'hommes, on en joue de une à
// cinq, la combinaison porte un nom, et le nom donne une puissance et un
// multiplicateur. Le produit des deux est retranché à la coque de la prise.
// Le pari du joueur n'est pas « est-ce que ça touche » — ça touche toujours —
// mais « est-ce que ma main tiendra jusqu'au bout de l'objectif ».
//
// RÈGLE 1 DU DÉPÔT : aucune entropie ici — pas de tirage, pas d'horloge, pas
// de source cryptographique. Le battage et la pioche prennent un `rng` en argument parce qu'ils
// relèvent de la GÉNÉRATION ; l'évaluation d'une volée n'en prend pas parce
// qu'elle relève de la RÉSOLUTION (brief §4.1). Une même main jouée deux fois
// donne deux fois le même chiffre.
//
// RÈGLE 5 : un ordre impossible rend `false` et dit pourquoi, il ne se contente
// jamais de ne rien faire.

export const MAIN_MAX = 5;

// Les manœuvres, de la plus forte à la plus faible. La PREMIÈRE qui accepte la
// volée l'emporte : l'ordre du tableau EST la hiérarchie, il n'y a pas de score
// caché à comparer. Un joueur qui lit le tableau de haut en bas sait exactement
// ce qu'il vise.
export const MANOEUVRES = [
  {
    id: 'abordage', nom: 'Abordage', base: 90, mult: 8,
    eff: 'cinq hommes d’un même quart, dont trois abordeurs',
    ok: (v) => v.n === 5 && v.role.abordeur >= 3 && v.quarts === 1,
  },
  {
    id: 'salve', nom: 'Salve pleine', base: 70, mult: 6,
    eff: 'cinq hommes du même métier',
    ok: (v) => v.n === 5 && v.roleMax === 5,
  },
  {
    id: 'bordee_complete', nom: 'Bordée complète', base: 55, mult: 5,
    eff: 'cinq hommes du même quart',
    ok: (v) => v.n === 5 && v.quarts === 1,
  },
  {
    id: 'bordee_groupee', nom: 'Bordée groupée', base: 45, mult: 5,
    eff: 'quatre hommes du même métier',
    ok: (v) => v.roleMax >= 4,
  },
  {
    id: 'bordee', nom: 'Bordée', base: 30, mult: 4,
    eff: 'quatre hommes du même quart',
    ok: (v) => v.quartMax >= 4,
  },
  {
    id: 'groupe', nom: 'Trois du même métier', base: 25, mult: 3,
    eff: 'trois hommes du même métier',
    ok: (v) => v.roleMax >= 3,
  },
  {
    id: 'quart_complet', nom: 'Quart complet', base: 15, mult: 3,
    eff: 'les quatre métiers représentés',
    ok: (v) => v.rolesDistincts >= 4,
  },
  {
    id: 'double_paire', nom: 'Deux paires', base: 15, mult: 2,
    eff: 'deux métiers doublés',
    ok: (v) => v.paires >= 2,
  },
  {
    id: 'paire', nom: 'Paire de frères', base: 10, mult: 2,
    eff: 'deux hommes du même métier',
    ok: (v) => v.roleMax >= 2,
  },
  {
    id: 'isole', nom: 'Sans concert', base: 5, mult: 1,
    eff: 'personne ne manœuvre avec personne',
    ok: () => true,
  },
];

// Le bord d'un quart : la règle « franc-bord » masque tout un côté du navire.
export const QUART_BORD = { ba: 'babord', br: 'babord', ta: 'tribord', tr: 'tribord' };

export const MANOEUVRE_PAR_ID = Object.fromEntries(MANOEUVRES.map((m) => [m.id, m]));

const FEU = { id: 'feu', nom: 'Feu', role: 'feu', quart: 'aucun', valeur: 0 };

export function estFeu(c) { return c.role === 'feu'; }

// Valeur effective d'une carte : le grade la relève, la blessure la baisse.
export function valeur(c) {
  if (estFeu(c)) return 0;
  return Math.max(0, (c.valeur || 0) + (c.grade || 0));
}

// --- lecture d'une volée (pure, sans état de partie) ---------------------

function profil(cartes) {
  const hommes = cartes.filter((c) => !estFeu(c));
  const role = { canonnier: 0, gabier: 0, abordeur: 0, charpentier: 0 };
  const quart = {};
  for (const c of hommes) {
    if (role[c.role] !== undefined) role[c.role] += 1;
    quart[c.quart] = (quart[c.quart] || 0) + 1;
  }
  const comptes = Object.values(role);
  const cq = Object.values(quart);
  return {
    n: hommes.length,
    role,
    roleMax: comptes.length ? Math.max(...comptes) : 0,
    rolesDistincts: comptes.filter((x) => x > 0).length,
    paires: comptes.filter((x) => x >= 2).length,
    quarts: cq.length,
    quartMax: cq.length ? Math.max(...cq) : 0,
  };
}

// La manœuvre d'une volée. Rend toujours quelque chose pour une volée non vide,
// `null` pour une volée vide : l'aperçu a besoin d'un nom à afficher dès la
// première carte touchée.
export function manoeuvre(cartes) {
  if (!cartes.length) return null;
  const v = profil(cartes);
  if (!v.n) return { ...MANOEUVRE_PAR_ID.isole, base: 0, mult: 1, nom: 'Rien que de la fumée', eff: 'que des Feux' };
  return MANOEUVRES.find((m) => m.ok(v)) || MANOEUVRES[MANOEUVRES.length - 1];
}

// --- évaluation d'une volée dans une partie ------------------------------

// Rend le détail complet, pas seulement le total : l'aperçu affiche ligne par
// ligne d'où vient chaque point, et c'est ce qui rend le tour lisible.
export function evaluer(P, cartes) {
  const m = manoeuvre(cartes);
  if (!m) return { manoeuvre: null, base: 0, mult: 0, points: 0, lignes: [] };
  const prise = P.prise;
  const regle = prise ? prise.regle : null;
  const lignes = [];
  let base = m.base;
  let mult = m.mult;
  lignes.push({ quoi: m.nom, base: m.base, mult: m.mult });

  const bas = prise ? prise.pv <= prise.max * (P.reliques.includes('grappins') ? 0.7 : 0.5) : false;
  for (const c of cartes) {
    if (estFeu(c)) { lignes.push({ quoi: 'Feu', base: 0, mult: 0 }); continue; }
    const v = valeur(c);
    if (c.role === 'charpentier') { lignes.push({ quoi: `${c.nom} — répare`, base: 0, mult: 0 }); continue; }
    if (c.role === 'gabier') { mult += 1; lignes.push({ quoi: `${c.nom} — le vent`, base: v, mult: 1 }); base += v; continue; }
    if (c.role === 'abordeur') {
      const g = bas ? v * 2 : v;
      lignes.push({ quoi: `${c.nom}${bas ? ' — à l’abordage' : ''}`, base: g, mult: 0 });
      base += g; continue;
    }
    // canonnier
    if (regle === 'franc_bord' && QUART_BORD[c.quart] === 'tribord') { lignes.push({ quoi: `${c.nom} — bord masqué`, base: 0, mult: 0 }); continue; }
    lignes.push({ quoi: c.nom, base: v, mult: 0 });
    base += v;
  }

  if (P.reliques.includes('poudre_seche')) { mult += 1; lignes.push({ quoi: 'Poudre sèche', base: 0, mult: 1 }); }
  if (regle === 'cuirasse' && mult > 8) { lignes.push({ quoi: 'Bordé doublé — plafond', base: 0, mult: 8 - mult }); mult = 8; }

  const mm = P.meteo && P.meteo.mods ? (P.meteo.mods.damageMult || 1) : 1;
  if (mm !== 1) lignes.push({ quoi: `${P.meteo.name_fr} ×${mm}`, base: 0, mult: 0 });

  let points = Math.round(base * mult * mm);
  if (regle === 'lest' && cartes.length < 3) {
    points = Math.round(points / 2);
    lignes.push({ quoi: 'Lourdement lestée — moitié', base: 0, mult: 0 });
  }
  return { manoeuvre: m, base, mult, points, lignes };
}

// --- partie ---------------------------------------------------------------

let uid = 0;
function carte(def) { return { ...def, uid: ++uid, grade: 0 }; }
function feu() { return carte(FEU); }

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
    equipage: contenu.equipage.map(carte),
    reliques: [],
    butin: 0,
    prise: null,
    prisesFaites: 0,
    pioche: [], main: [], defausse: [],
    selection: [],
    bordees: 0, largages: 0,
    meteo: null,
    fini: null,
    journal: [],
  };
}

export function tailleMain(P) { return 7 + (P.reliques.includes('longue_vue') ? 1 : 0); }

// Lance une prise : c'est de la génération, donc le battage prend le `rng`.
export function engager(P, defPrise, meteo, rng) {
  P.prise = { ...defPrise, pv: defPrise.objectif, max: defPrise.objectif };
  P.meteo = meteo || null;
  P.bordees = defPrise.bordees + (P.reliques.includes('pavillon') ? 1 : 0);
  P.largages = 2 + (P.reliques.includes('seaux') ? 1 : 0);
  P.pioche = melanger(P.equipage, rng);
  P.main = []; P.defausse = []; P.selection = [];
  P.fini = null;
  completer(P, rng);
  return true;
}

export function completer(P, rng) {
  const cible = tailleMain(P);
  while (P.main.length < cible) {
    if (!P.pioche.length) {
      if (!P.defausse.length) break;
      P.pioche = melanger(P.defausse, rng);
      P.defausse = [];
    }
    P.main.push(P.pioche.pop());
  }
}

export function selectionner(P, c) {
  const i = P.selection.indexOf(c);
  if (i >= 0) { P.selection.splice(i, 1); return true; }
  if (P.selection.length >= MAIN_MAX) return false;
  if (!P.main.includes(c)) return false;
  P.selection.push(c);
  return true;
}

// Joue la volée sélectionnée. Ne pioche PAS : le tirage est de la génération et
// reste chez l'appelant, qui décide du `rng` — c'est ce qui garde ce module
// testable sans dé.
export function jouer(P) {
  if (P.fini || !P.prise) return false;
  if (!P.selection.length) return false;
  if (P.bordees <= 0) return false;

  const r = evaluer(P, P.selection);
  P.prise.pv = Math.max(0, P.prise.pv - r.points);
  P.bordees -= 1;

  let repare = 0;
  for (const c of P.selection) if (!estFeu(c) && c.role === 'charpentier') repare += 1;
  if (repare) {
    P.largages += repare;
    const jete = [];
    for (const zone of [P.main, P.pioche, P.defausse]) {
      for (let k = 0; k < repare && jete.length < repare; k++) {
        const i = zone.findIndex(estFeu);
        if (i >= 0) jete.push(zone.splice(i, 1)[0]);
      }
    }
    P.journal.push(`Radoub : +${repare} largage${repare > 1 ? 's' : ''}${jete.length ? `, ${jete.length} Feu jeté` : ''}`);
  }

  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];

  if (P.prise.regle === 'riposte' && !P.reliques.includes('quille')) {
    P.pioche.unshift(feu());
    P.journal.push('Riposte : une carte Feu entre dans ta pioche');
  }

  if (P.prise.pv <= 0) { P.fini = 'prise'; P.butin += P.prise.butin; P.prisesFaites += 1; }
  else if (P.bordees <= 0) P.fini = 'rompu';
  return r;
}

export function largage(P) {
  if (P.fini || !P.selection.length) return false;
  if (P.largages <= 0) return false;
  P.largages -= 1;
  for (const c of P.selection) {
    const i = P.main.indexOf(c);
    if (i >= 0) P.main.splice(i, 1);
    if (!estFeu(c)) P.defausse.push(c);
  }
  P.selection = [];
  return true;
}

// Ce que rapporterait la meilleure volée de la main actuelle. Sert à l'aide et
// aux tests : si un joueur appliqué ne fait pas nettement mieux qu'un joueur
// qui joue au hasard, le choix ne compte pas et la manche ne sert à rien.
export function meilleureVolee(P) {
  const main = P.main;
  let best = null;
  const n = main.length;
  for (let masque = 1; masque < (1 << n); masque++) {
    let bits = 0;
    for (let i = 0; i < n; i++) if (masque & (1 << i)) bits++;
    if (bits > MAIN_MAX) continue;
    const cartes = main.filter((_, i) => masque & (1 << i));
    const r = evaluer(P, cartes);
    if (!best || r.points > best.points) best = { ...r, cartes };
  }
  return best;
}

export function recruter(P, def) {
  if (P.butin < def.prix) return false;
  P.butin -= def.prix;
  P.equipage.push(carte(def));
  return true;
}

export function acheterRelique(P, def) {
  if (P.butin < def.prix) return false;
  if (P.reliques.includes(def.id)) return false;
  P.butin -= def.prix;
  P.reliques.push(def.id);
  return true;
}

export function graduer(P, c, prix = 4) {
  if (P.butin < prix) return false;
  if (estFeu(c) || c.grade >= 3) return false;
  P.butin -= prix;
  c.grade += 1;
  return true;
}
