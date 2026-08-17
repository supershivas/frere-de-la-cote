// La rade — proposition C, l'échelle de la peinture : beaucoup de coques,
// petites, et un raid qui se joue en une dizaine d'ordres.
//
// Ce que C change par rapport à B2 :
//   - on ne commande plus UN navire mais une escadre de cinq ;
//   - un navire n'a plus de jauges à lire, il a trois points et une silhouette
//     qui s'enfonce ;
//   - un tour est UN ordre, pas un formulaire : viser, serrer, aborder, rompre.
//
// La colonne vertébrale est un pari qui monte : les transports — le butin —
// sont au fond de la rade, sous la batterie de côte. Chaque bande gagnée vaut
// plus cher et coûte plus cher, et se retirer avec ce qu'on a est toujours un
// coup jouable. C'est ce qu'était un raid sur une rade.
//
// Règles PURES : aucun DOM, aucun minuteur, aucun aléatoire (brief §4.1).
// L'entropie vit dans `genererRade`, qui compose la rade avant le premier tour.

export const LARGE = 0, LIGNE = 1, TERRE = 2;
export const BANDES = ['Au large', 'La ligne', 'Sous la côte'];

export const PV_NAVIRE = 4;          // quatre coups avant qu'un des nôtres sorte
const CANON_PAR_NAVIRE = 2;          // bordées par coque encore à flot
const RESISTANCE = { escorte: 3, transport: 2, batterie: 5 };
// Riposte par coque ennemie. Une escadre d'escorte tire moins vite qu'elle
// n'est nombreuse ; la batterie de côte, elle, fait très mal — c'est ce qui
// rend « sous la côte » un pari et non une étape.
const RIPOSTE = { escorte: 0.5, transport: 0, batterie: 2 };
// Un abordage se paie, mais un coup pour deux prises : à un pour un, aborder
// coûtait plus cher que ce qu'il rapportait et personne ne le choisissait.
const PRIX_ABORDAGE = 0.5;

// ---------------------------------------------------------------------------
// Mise en place

export function nouvelleRade(escadres, { navires = 5 } = {}) {
  return {
    tour: 1,
    bande: LARGE,
    nous: Array.from({ length: navires }, (_, i) => ({ id: i + 1, pv: PV_NAVIRE })),
    escadres: escadres.map((e) => ({ ...e, pvRestants: e.n * RESISTANCE[e.role] })),
    pris: [],
    journal: [],
    fini: null,                      // 'retire' | 'detruit'
  };
}

export const aFlot = (R) => R.nous.filter((n) => n.pv > 0);
export const canons = (R) => aFlot(R).length * CANON_PAR_NAVIRE;
export const vivantes = (R) => R.escadres.filter((e) => e.n > 0);
export const butin = (R) => R.pris.reduce((s, p) => s + p.valeur, 0);

// Une escadre est atteignable au canon depuis la bande courante ou la voisine ;
// on ne borde pas d'un bout à l'autre de la rade.
export const aPortee = (R, e) => Math.abs(e.bande - R.bande) <= 1 && e.n > 0;
export const bordAbord = (R, e) => e.bande === R.bande && e.n > 0;

// ---------------------------------------------------------------------------
// Ce que l'ordre coûte et rapporte, calculé AVANT de le donner : le joueur voit
// le résultat de son choix, il ne le découvre pas (§4.2).
//
// `ordonner` rend true si l'ordre a été exécuté. Un ordre impossible ne fait
// RIEN et le dit : un refus silencieux consomme le tour du joueur et ne se
// remarque qu'en constatant que rien n'a bougé.

export function apercu(R, ordre, cibleId) {
  const cible = R.escadres.find((e) => e.id === cibleId);
  const g = canons(R);
  switch (ordre) {
    case 'bordee': {
      if (!cible || !aPortee(R, cible)) return null;
      const reste = Math.max(0, cible.pvRestants - g);
      const apres = Math.ceil(reste / RESISTANCE[cible.role]);
      return { coules: cible.n - apres, degats: g, restera: apres };
    }
    case 'aborder': {
      if (!cible || !bordAbord(R, cible) || cible.role === 'batterie') return null;
      const prises = Math.min(Math.floor(g / 2), cible.n);
      return { prises, valeur: prises * cible.valeur, blesses: Math.round(prises * PRIX_ABORDAGE) };
    }
    default:
      return null;
  }
}

// La riposte du tour, annoncée un tour d'avance.
export function riposte(R) {
  return vivantes(R)
    .filter((e) => e.bande === R.bande && RIPOSTE[e.role] > 0)
    .map((e) => ({ id: e.id, nom: e.nom, coups: Math.ceil(e.n * RIPOSTE[e.role]) }));
}
export const coupsRecus = (R) => riposte(R).reduce((s, r) => s + r.coups, 0);

// Ce que coûte de sortir maintenant : tout ce qui tire encore, sur chaque bande
// qu'il faut franchir. Sortir de sous une batterie intacte peut tuer.
export function coutDeRetraite(R) {
  let n = 0;
  for (let b = R.bande; b > LARGE; b--) {
    n += vivantes(R)
      .filter((e) => e.bande === b && RIPOSTE[e.role] > 0)
      .reduce((s, e) => s + Math.ceil(e.n * RIPOSTE[e.role]), 0);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Les ordres. Un seul par tour, puis la rade répond.

export function ordonner(R, ordre, cibleId) {
  if (R.fini) return false;
  const cible = R.escadres.find((e) => e.id === cibleId);
  const g = canons(R);

  if (ordre === 'bordee') {
    if (!cible || !aPortee(R, cible)) return false;
    const avant = cible.n;
    cible.pvRestants = Math.max(0, cible.pvRestants - g);
    cible.n = Math.ceil(cible.pvRestants / RESISTANCE[cible.role]);
    R.journal.push(`Bordée sur ${cible.nom} — ${avant - cible.n} coque(s) au fond.`);
  } else if (ordre === 'aborder') {
    if (!cible || !bordAbord(R, cible) || cible.role === 'batterie') return false;
    const prises = Math.min(Math.floor(g / 2), cible.n);
    cible.n -= prises;
    cible.pvRestants = cible.n * RESISTANCE[cible.role];
    for (let i = 0; i < prises; i++) R.pris.push({ nom: cible.nom, valeur: cible.valeur });
    // Un abordage se paie en hommes : ici, en coques entamées.
    encaisser(R, Math.round(prises * PRIX_ABORDAGE), 'abordage');
    R.journal.push(`${prises} prise(s) sur ${cible.nom}.`);
  } else if (ordre === 'serrer') {
    if (R.bande >= TERRE) return false;
    R.bande++;
    R.journal.push(`On serre — ${BANDES[R.bande].toLowerCase()}.`);
  } else if (ordre === 'rompre') {
    if (R.bande <= LARGE) return false;
    R.bande--;
    R.journal.push(`On rompt — ${BANDES[R.bande].toLowerCase()}.`);
  } else if (ordre === 'retirer') {
    // On se retire d'où l'on est, pas seulement du large : obliger à remonter
    // bande par bande faisait deux tours vides, et une escadre qui avait vidé
    // la rade se retrouvait à faire l'aller-retour sans rien à décider.
    // Sortir se paie : chaque bande franchie donne un dernier coup au but.
    const cout = coutDeRetraite(R);
    if (cout) {
      encaisser(R, cout, 'retraite');
      R.journal.push(`On sort sous le feu — ${cout} coup(s) encaissé(s).`);
    }
    R.fini = aFlot(R).length ? 'retire' : 'detruit';
    R.journal.push(R.fini === 'retire'
      ? "Le cap au large. Ce qu'on tient est à nous."
      : "La dernière coque est restée dans la passe.");
    return true;
  } else {
    return false;
  }

  finDeTour(R);
  return true;
}

function finDeTour(R) {
  const coups = coupsRecus(R);
  if (coups) {
    encaisser(R, coups, 'riposte');
    R.journal.push(`La rade riposte — ${coups} coup(s) au but.`);
  }
  R.tour++;
  if (!aFlot(R).length) R.fini = 'detruit';
}

// Les coups se répartissent sur les coques les plus saines : une escadre perd
// des navires lentement, pas d'un seul coup. Aucun tirage — l'ordre est fixé
// par les points de vie puis par l'identifiant.
function encaisser(R, coups, cause) {
  for (let i = 0; i < coups; i++) {
    const cible = aFlot(R).sort((a, b) => b.pv - a.pv || a.id - b.id)[0];
    if (!cible) return;
    cible.pv--;
    if (cible.pv <= 0) R.journal.push(`Un des nôtres sort du combat (${cause}).`);
  }
}

// ---------------------------------------------------------------------------
// Composition de la rade. C'est ICI que l'aléatoire entre, et nulle part
// ailleurs : une rade tirée, puis un problème fermé.

export function genererRade(rng) {
  const r = () => rng();
  const pick = (a) => a[Math.floor(r() * a.length) % a.length];
  const n = (a, b) => a + Math.floor(r() * (b - a + 1));

  const escadres = [
    { id: 1, nom: pick(['Escorte de tête', 'Les frégates', 'La garde du môle']),
      role: 'escorte', bande: LARGE, n: n(2, 4), valeur: 40 },
    { id: 2, nom: pick(['Le gros de la ligne', 'Les vaisseaux', "L'escadre du port"]),
      role: 'escorte', bande: LIGNE, n: n(3, 6), valeur: 55 },
    { id: 3, nom: pick(['Le convoi', 'Les marchands', 'La flotte de sucre']),
      role: 'transport', bande: LIGNE, n: n(3, 5), valeur: 90 },
    { id: 4, nom: pick(['Les galions', "L'argent du roi", 'Les caraques']),
      role: 'transport', bande: TERRE, n: n(3, 6), valeur: 160 },
    { id: 5, nom: pick(['La batterie du fort', 'Le môle armé', 'Les pièces de côte']),
      role: 'batterie', bande: TERRE, n: n(1, 2), valeur: 0 },
  ];
  return escadres;
}
