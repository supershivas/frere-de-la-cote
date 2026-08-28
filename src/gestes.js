// LES CINQ CARACTÈRES DU GESTE — le contenu du banc d'essai.
//
// Ils vivent dans un module et non dans la maquette pour une seule raison : un
// test doit pouvoir les lire. Le premier banc empilait cinq crans qui
// s'ajoutaient, et ses tests vérifiaient que les cinq FONCTIONNENT — jamais
// qu'elles se DISTINGUENT. Mesuré après coup, quatre des cinq tenaient dans
// 5 px les unes des autres : l'échelle existait dans le code et nulle part sur
// l'écran. C'est la règle 6 du dépôt, appliquée trop tard : une contrainte sans
// instrument est un vœu.
//
// D'où le changement de forme. Ce ne sont plus cinq CRANS d'une même échelle,
// ce sont cinq CARACTÈRES, et chacun pose une question de conception
// différente. L'empilement servait à rendre une différence attribuable ; c'est
// le FANTÔME qui s'en charge maintenant — il superpose le geste du jeu actuel
// en filigrane sous celui qu'on essaie, si bien qu'on voit l'écart au lieu de
// le déduire.
//
// CHAQUE CARACTÈRE A UNE SIGNATURE, ET UNE SEULE. `signature` n'est pas une
// étiquette : c'est ce que le test de séparation exige de trouver, et deux
// caractères qui la partageraient seraient le même. Les nombres qui suivent
// sont réglés sur le geste QU'ON FAIT VRAIMENT — une poussée droite vers le
// haut, médiane relevée à 647 px/s. Le premier banc branchait ses effets sur
// une vitesse horizontale, une vitesse haute ou le tirage vers le bas : la
// montée au pouce n'en produit aucun des trois, et n'allumait donc rien.

export const GESTES = [
  {
    rang: 'I', nom: 'amarre', signature: 'tension',
    question: 'est-ce que ça résiste ?',
    note: '<b>L’amarre</b> — les cartes sont tenues. Une aussière se tend du râtelier à ton doigt, le carton s’incline vers son ancrage, et à 44 px elle <b>casse</b> : le paquet part d’un coup. Le seuil se sent avant qu’on le franchisse.',
    // Tant que l'amarre tient, la carte ne suit qu'au dixième : c'est ce qui
    // fait qu'on TIRE dessus au lieu de la déplacer.
    retenue: 0.1, rupture: 44, recul: 620,
    raideur: 380, zeta: 0.6, leve: 14, tas: 70, course: 150,
    amarre: true, cabrage: 0, evantail: 0, poussiere: 0, motes: 0,
    empreinte: false, visee: 0, trainee: 0, lancer: 0, sequenceApres: false,
  },
  {
    rang: 'II', nom: 'poids mort', signature: 'inertie',
    question: 'est-ce que ça pèse ?',
    note: '<b>Le poids mort</b> — soixante pixels de retard, le paquet <b>cabre</b> quand tu accélères, les cartes du dessous s’ouvrent en arc derrière, et l’ombre se détache du carton sur le bois.',
    retenue: 1, rupture: 0, recul: 0,
    // Un ressort MOU et bien amorti : c'est le retard qui fait la masse, pas le
    // rebond. À 140 de raideur, la carte traîne de ~60 px derrière le doigt.
    raideur: 140, zeta: 0.8, leve: 22, tas: 90, course: 220,
    amarre: false, cabrage: 26, evantail: 16, poussiere: 0, motes: 0,
    empreinte: false, visee: 0, trainee: 0, lancer: 0, sequenceApres: false,
  },
  {
    rang: 'III', nom: 'poudrière', signature: 'matière',
    question: 'est-ce que c’est sale ?',
    note: '<b>La poudrière</b> — bouffée de poussière au décollage, sciure en suspension que le paquet traverse, braises qui s’égrènent du boulet rouge, et le râtelier garde <b>la marque</b> de la carte enlevée.',
    retenue: 1, rupture: 0, recul: 0,
    raideur: 300, zeta: 0.72, leve: 18, tas: 74, course: 200,
    amarre: false, cabrage: 0, evantail: 0,
    // Gros grains et peu nombreux : dix-huit grains de 2 px lâchés sous le
    // pouce ne se voient pas — c'est ce qu'a montré la première version.
    poussiere: 16, motes: 20, empreinte: true,
    visee: 0, trainee: 0, lancer: 0, sequenceApres: false,
  },
  {
    rang: 'IV', nom: 'timonerie', signature: 'visée',
    question: 'est-ce que ça vise ?',
    note: '<b>La timonerie</b> — à mi-écran la coque <b>capte</b> le paquet : les cartes pivotent vers elle comme des aiguilles, une ligne de visée se tend jusqu’au point d’impact, et la coque se raidit à l’approche.',
    retenue: 1, rupture: 0, recul: 0,
    raideur: 320, zeta: 0.75, leve: 16, tas: 70, course: 200,
    amarre: false, cabrage: 0, evantail: 0, poussiere: 0, motes: 0,
    empreinte: false,
    // La capture commence à la moitié de la course et va jusqu'à 0,45 : en
    // deçà, on ne la sent pas ; au-delà, le paquet n'obéit plus au doigt.
    visee: 0.45, viseeDepart: 0.5, trainee: 0, lancer: 0, sequenceApres: false,
  },
  {
    rang: 'V', nom: 'bordée', signature: 'lancer',
    question: 'est-ce que ça part ?',
    note: '<b>La bordée</b> — le lâcher <b>est</b> le coup. Pas de compte intercalé : le paquet file avec ta vitesse réelle, culbute, frappe le bordé, et le chiffre ne monte qu’après.',
    retenue: 1, rupture: 0, recul: 0,
    raideur: 340, zeta: 0.64, leve: 18, tas: 66, course: 200,
    amarre: false, cabrage: 0, evantail: 0, poussiere: 0, motes: 0,
    empreinte: false, visee: 0,
    // 400 px/s, sous la médiane relevée d'un glissement réel (647). Le premier
    // banc la posait à 850 : franchie une fois sur dix-huit, la traînée
    // n'apparaissait jamais.
    trainee: 400, lancer: 1,
    // LE COMPTE VIENT APRÈS L'IMPACT, et c'est toute la proposition : ailleurs
    // la séquence s'intercale entre le lâcher et le coup, si bien qu'on ne
    // relie plus l'un à l'autre.
    sequenceApres: true,
  },
];

// LES SIGNATURES SONT EXCLUSIVES. Deux caractères qui partageraient la leur
// seraient le même caractère sous deux noms — et c'est exactement le défaut que
// le premier banc a livré. `test/gestes.test.js` le vérifie.
export const SIGNATURES = GESTES.map((g) => g.signature);

// LE FANTÔME est le geste du jeu TEL QU'IL EST AUJOURD'HUI : le paquet colle au
// doigt, sans ressort, sans masse, sans retard. Il n'est pas une sixième
// variante — c'est la référence, et elle se superpose plutôt qu'elle ne se
// choisit. Comparer deux choses en alternant entre elles, c'est comparer deux
// souvenirs ; superposées, on lit l'écart.
export const REFERENCE = {
  rang: '👻', nom: 'référence', signature: 'aucune',
  retenue: 1, raideur: 0, zeta: 0, leve: 14, tas: 70, course: 70,
  direct: true,
};
