// LE VOYAGE — la progression sur la carte des Caraïbes.
//
// La carte n'est pas une échelle de nœuds abstraits : c'est une mer réelle,
// toujours abordée par le même coin, l'Île de la Tortue. Ce qu'on apprend
// d'une partie à l'autre, c'est cette mer-là (§10.2 du brief).
//
// Ce module ne sait rien du DOM et rien des cartes : il dit OÙ l'on est, où
// l'on peut aller, et ce qu'on y trouve. Ce qu'on fait d'une prise, c'est
// l'affaire de `src/cartes.js`.
//
// RÈGLE 1 DU DÉPÔT : aucune entropie dans la résolution. Choisir une escale et
// lire ce qu'elle coûte n'en prend pas ; TIRER la prise qui s'y trouve relève
// de la génération et prend un `rng` en argument.

import { placeById, reachableFrom, START_ID, nodeCost } from './caribbean.js';

export { START_ID, nodeCost };

// Ce que chaque type d'escale demande au joueur. Le libellé est dit AVANT
// qu'on y aille : une escale qui ne dirait pas ce qu'elle est serait un pari.
export const ESCALES = {
  chasse: { nom: 'Une prise', quoi: 'Un navire à prendre. Ce qu’il porte se partage ensuite.' },
  port: { nom: 'Un port', quoi: 'Radoub complet, recrutement, reliques et officiers.' },
  epave: { nom: 'Une épave', quoi: 'Ce que la mer a laissé. Gratuit, et sans personne pour le défendre.' },
  evenement: { nom: 'Une rencontre', quoi: 'Une décision à prendre. Rien à combattre.' },
  boss: { nom: 'L’Almirante', quoi: 'Le vaisseau amiral de la flotte des Indes.' },
};

export function nouveauVoyage() {
  return {
    lieu: START_ID,
    acte: 1,
    visites: [START_ID],
    etapes: 0,
    journal: [],
  };
}

export const ici = (V) => placeById(V.lieu);

// Où l'on peut mettre le cap. La géographie décide, pas un index de ligne.
export function escales(V) {
  return reachableFrom(V.lieu, V.acte).map((p) => ({ ...p, escale: ESCALES[p.type] || ESCALES.chasse }));
}

export function cingler(V, id) {
  const p = placeById(id);
  if (!p) return { ok: false, pourquoi: 'Ce lieu n’existe pas.' };
  if (!escales(V).some((e) => e.id === id)) return { ok: false, pourquoi: 'Trop loin d’ici pour une seule traversée.' };
  V.lieu = id;
  V.etapes += 1;
  if (!V.visites.includes(id)) V.visites.push(id);
  if (p.act > V.acte) V.acte = p.act;
  return { ok: true, place: p };
}

// La prise qu'on trouve à une escale de chasse. C'est de la GÉNÉRATION : le
// tirage du navire, de son nom et de sa météo prend le `rng`. Une fois tirée,
// elle ne bouge plus — le combat, lui, est sans dé.
const NOMS = ['Santa Clara', 'Nuestra Señora', 'San Cristóbal', 'La Concepción',
  'El Rosario', 'San Felipe', 'La Trinidad', 'Santa Ana'];

export function priseDe(V, place, contenu, rng) {
  const est = place.type === 'boss';
  // L'acte donne le rang du navire ; l'escale précise. Deux prises du même
  // acte ne sont pas identiques, mais elles sont de la même force : c'est ce
  // qui rend la carte lisible.
  const paliers = { 1: [0, 1], 2: [1, 2], 3: [2, 3] };
  const choix = paliers[Math.min(3, V.acte)] || paliers[1];
  const base = contenu.prises[est ? 4 : choix[Math.floor(rng() * choix.length)]];
  const dur = est ? 1.35 : 1 + 0.06 * V.etapes;
  return {
    ...base,
    nom: est ? 'L’Almirante' : NOMS[Math.floor(rng() * NOMS.length)],
    pv: Math.round(base.pv * dur),
    riposte: Math.round(base.riposte * dur),
    butin: base.butin + (est ? 12 : Math.floor(V.etapes / 2)),
    sceau: (rng() * 1e9) | 0,
    lieu: place.name,
  };
}

// Ce qu'une épave rend : un objet, gratuitement, parmi ceux qu'on n'a pas.
export function trouvaille(P, contenu, rng) {
  const reliques = contenu.reliques.filter((r) => !P.reliques.includes(r.id));
  const officiers = contenu.officiers.filter((o) => !P.officiers.includes(o.id));
  const pool = [
    ...reliques.map((r) => ({ genre: 'relique', def: r })),
    ...(P.officiers.length < 3 ? officiers.map((o) => ({ genre: 'officier', def: o })) : []),
  ];
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length)];
}

// Une rencontre : deux branches, chacune dit son prix avant qu'on choisisse.
export const RENCONTRES = [
  {
    id: 'naufrages', titre: 'Des naufragés',
    texte: 'Une chaloupe dérive, six hommes dedans. Ils ont soif depuis trois jours.',
    branches: [
      { texte: 'Les prendre à bord', gain: 'recrue', dit: 'Un homme de plus à l’équipage.' },
      { texte: 'Passer au large', gain: 'soin', dit: 'La Tortue est radoubée de 20.' },
    ],
  },
  {
    id: 'careneur', titre: 'Un caréneur',
    texte: 'Une anse abritée, un fond de sable. On peut y coucher le navire sur le flanc.',
    branches: [
      { texte: 'Caréner', gain: 'soin_plein', dit: 'La Tortue repart neuve.' },
      { texte: 'Fouiller la cale du dernier caréné', gain: 'butin', dit: '+6 de butin.' },
    ],
  },
  {
    id: 'deserteur', titre: 'Un déserteur espagnol',
    texte: 'Il connaît les routes de la flotte, et il veut sa part.',
    branches: [
      { texte: 'L’écouter (−4 butin)', gain: 'carte_marine', dit: 'La prochaine prise annonce deux coups à l’avance.' },
      { texte: 'Le jeter à la mer', gain: 'rien', dit: 'Rien. L’équipage approuve.' },
    ],
  },
];

export function rencontreDe(V, rng) {
  return RENCONTRES[Math.floor(rng() * RENCONTRES.length)];
}
